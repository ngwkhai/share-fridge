// Audit probes: exercise the checked-out client and server with disposable local data.
// These assertions confirm defects, not release readiness. No remote services are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

process.env.GEMINI_API_KEY = '';
const { default: handler } = await import('../../api/index.js');
const { db } = await import('../../server/apiHandler.js');
const { generateSessionToken } = await import('../../server/security.js');
const { parseVoiceWithGemini, suggestRecipesWithGemini } = await import('../../server/geminiService.js');
const results = [];
const record = (id, observed) => {
  results.push({ id, observed });
  console.log(`${id}: ${JSON.stringify(observed)}`);
};
const server = http.createServer(handler);
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const realFetch = globalThis.fetch;
const requests = [];
const pending = new Set();
globalThis.localStorage = {
  data: new Map(),
  getItem(key) { return this.data.get(key) ?? null; },
  setItem(key, value) { this.data.set(key, String(value)); },
  removeItem(key) { this.data.delete(key); }
};
globalThis.fetch = async (input, options) => {
  assert.equal(typeof input, 'string');
  assert.ok(input.startsWith('/'), 'Probe client must only request the local API');
  const promise = realFetch(`${base}${input}`, options);
  pending.add(promise);
  try {
    const response = await promise;
    requests.push({ method: options?.method || 'GET', path: input, status: response.status });
    return response;
  } finally { pending.delete(promise); }
};
const clientSource = fs.readFileSync(new URL('../../src/services/api.ts', import.meta.url), 'utf8');
const clientJs = ts.transpileModule(clientSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
const { api } = await import(`data:text/javascript;base64,${Buffer.from(clientJs).toString('base64')}`);
const raw = async (path, method = 'GET', body, headers = {}) => {
  const response = await realFetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, body: await response.json() };
};
const code = '919191';
const dto = { room_code: code, name: 'Audit vegetable', compartment: 'CRISPER', shelf_life_days: 1 };

try {
  await raw('/api/auth/create-room', 'POST', { code, name: 'Disposable audit room', passcode: '8642' });
  const food = (await raw('/api/foods', 'POST', dto)).body;
  const unauth = await raw(`/api/foods?room_code=${code}`);
  assert.equal(unauth.status, 200);
  assert.equal(unauth.body.items.length, 1);
  const crossRoom = await raw(`/api/foods/${food.id}`, 'DELETE', undefined, {
    Authorization: `Bearer ${generateSessionToken('929292', 'Other room')}`
  });
  assert.equal(crossRoom.status, 200);
  assert.equal(db.foods.has(food.id), false);
  record('P01_AUTH_NOT_ENFORCED', { unauthenticatedRead: unauth.status, crossRoomDelete: crossRoom.status });

  const room = await raw(`/api/rooms/${code}`);
  assert.ok(room.body.passcode_hash && room.body.salt);
  record('P02_PUBLIC_PASSWORD_MATERIAL', { status: room.status, fields: ['passcode_hash', 'salt'] });

  const overwrite = await raw('/api/auth/create-room', 'POST', { code, passcode: '0000' });
  const changedJoin = await raw('/api/auth/join-room', 'POST', { code, passcode: '0000' });
  assert.equal(overwrite.status, 201);
  assert.equal(changedJoin.status, 200);
  await raw('/api/rooms', 'POST', { code });
  const passwordlessJoin = await raw('/api/auth/join-room', 'POST', { code, passcode: 'anything' });
  assert.equal(passwordlessJoin.status, 200);
  record('P03_ROOM_OVERWRITE', { overwrite: overwrite.status, changedPasswordJoin: changedJoin.status, legacyPasswordRemovalJoin: passwordlessJoin.status });

  const clientFood = await api.addFood(dto);
  const consumed = await api.consumeFood(clientFood.id, undefined, true);
  assert.equal(requests.at(-1).status, 404);
  assert.equal(consumed.error, 'Endpoint not found');
  assert.notEqual(db.foods.get(clientFood.id).status, 'CONSUMED');
  record('P04_REAL_CLIENT_CONSUME', { ...requests.at(-1), returnedAsFood: consumed, storedStatus: db.foods.get(clientFood.id).status });

  const shopping = await api.addShoppingItem({ room_code: code, name: 'Audit shopping item' });
  const toggled = await api.toggleShoppingItem(shopping.id, true);
  assert.equal(requests.at(-1).status, 404);
  assert.equal(db.shoppingItems.get(shopping.id).is_bought, false);
  record('P05_REAL_CLIENT_TOGGLE', { ...requests.at(-1), returnedAsShoppingItem: toggled });

  const push = await api.subscribeNotifications(code, { endpoint: 'local-browser-subscription', keys: { auth: 'mock', p256dh: 'mock' } }, 'Audit device');
  assert.equal(requests.at(-1).status, 404);
  assert.equal(db.subscribers.size, 0);
  record('P06_REAL_CLIENT_PUSH', { ...requests.at(-1), returnedWithoutThrowing: push, storedSubscriptions: db.subscribers.size });

  // A fresh module evaluation creates the same independent state as a fresh worker.
  const freshWorker = await import(`../../server/apiHandler.js?audit-fresh-worker=${Date.now()}`);
  assert.equal(freshWorker.db.rooms.has(code), false);
  assert.equal(freshWorker.db.foods.has(clientFood.id), false);
  record('P07_FRESH_WORKER_STATE', { originalRoomExists: db.rooms.has(code), freshWorkerRoomExists: freshWorker.db.rooms.has(code), freshWorkerFoodExists: freshWorker.db.foods.has(clientFood.id) });

  // Execute the exact loadData callback from App.tsx, with state setters captured.
  const appText = fs.readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let loadDataNode;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'loadData') loadDataNode = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(loadDataNode);
  const state = {};
  const sandbox = {
    api, console,
    setRoom: value => { state.room = value; },
    setRoomCode: value => { state.code = value; },
    setFoods: value => { state.foods = value; },
    setConsumedFoods: value => { state.consumed = value; },
    setShoppingItems: value => { state.shopping = value; }
  };
  vm.createContext(sandbox);
  const loadScript = ts.transpileModule(`globalThis.auditLoadData = ${loadDataNode.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(loadScript, sandbox);
  const staleFood = { ...clientFood, days_remaining: 0, status: 'EXPIRED', expiry_date: '2026-01-01T00:00:00.000Z' };
  api.foodCache.saveFoods(code, [staleFood]);
  await raw(`/api/foods/${clientFood.id}`, 'DELETE');
  assert.equal((await raw(`/api/foods?room_code=${code}`)).body.total, 0);
  await sandbox.auditLoadData(code);
  await Promise.all([...pending]);
  const resurrected = (await raw(`/api/foods?room_code=${code}`)).body.items;
  assert.equal(resurrected.length, 1);
  assert.notEqual(resurrected[0].id, staleFood.id);
  assert.equal(resurrected[0].status, 'FRESH');
  record('P08_REAL_APP_CACHE_RESURRECTS_DELETED_FOOD', { beforeReload: 0, afterReload: resurrected.length, idChanged: true, cachedStatus: staleFood.status, restoredStatus: resurrected[0].status, restoredDays: resurrected[0].days_remaining });

  const invalid = await raw('/api/foods', 'POST', { room_code: 'nonexistent', compartment: 'INVALID', shelf_life_days: 0 });
  assert.equal(invalid.status, 201);
  assert.equal(invalid.body.compartment, 'INVALID');
  assert.equal(invalid.body.days_remaining, 3);
  record('P09_INPUT_VALIDATION', { status: invalid.status, missingNameAccepted: !('name' in invalid.body), invalidCompartmentAccepted: invalid.body.compartment, requestedZeroDaysActual: invalid.body.days_remaining });

  const parsed = await parseVoiceWithGemini('Thịt ba chỉ nửa cân cất ngăn đá túi zip xanh');
  assert.equal(parsed.source, 'heuristic');
  assert.equal(parsed.parsed.quantity, '');
  record('P10_VOICE_CARD_EXAMPLE', { source: parsed.source, name: parsed.parsed.name, quantity: parsed.parsed.quantity });
  const expiredRecipes = await suggestRecipesWithGemini([{ name: 'Thịt quá hạn', status: 'EXPIRED', days_remaining: -5 }]);
  assert.ok(expiredRecipes[0].ingredients_used.includes('Thịt quá hạn'));
  const unrelated = await suggestRecipesWithGemini([{ name: 'Sữa chua', status: 'FRESH', days_remaining: 3 }]);
  record('P11_RECIPE_INGREDIENTS', { expiredIngredientIncluded: expiredRecipes[0].ingredients_used, unrelatedRecipe: unrelated[0].title, unrelatedIngredientsMarkedUsed: unrelated[0].ingredients_used });

  const spec = (await raw('/api/openapi.json')).body;
  const absentAuthPaths = ['/api/auth/create-room', '/api/auth/join-room', '/api/auth/verify-token'].filter(path => !spec.paths[path]);
  assert.equal(absentAuthPaths.length, 3);
  const removedShopping = await raw(`/api/shopping-items/${shopping.id}`, 'DELETE');
  record('P12_CONTRACT_DRIFT', { missingAuthPaths: absentAuthPaths, shoppingDeleteResponse: removedShopping.body });

  // Inspect actual component output using React SSR; no browser/device claims.
  const require = createRequire(import.meta.url);
  const foodComponent = ts.transpileModule(fs.readFileSync(new URL('../../src/components/FoodCard.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText;
  const componentContext = { require, exports: {} };
  vm.runInNewContext(foodComponent, componentContext);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(componentContext.exports.FoodCard, { food: staleFood, onConsume() {}, onDelete() {} }));
  assert.ok(html.includes('w-13 h-13'));
  const distAssets = new URL('../../dist/assets/', import.meta.url);
  const cssFile = fs.readdirSync(distAssets).find(name => name.endsWith('.css'));
  const css = fs.readFileSync(new URL(cssFile, distAssets), 'utf8');
  const absentSelectors = ['.w-13{', '.h-13{', '.w-22{', '.h-22{', '.text-fresh-800{'].filter(selector => !css.includes(selector));
  assert.equal(absentSelectors.length, 5);
  const sw = fs.readFileSync(new URL('../../dist/sw.js', import.meta.url), 'utf8');
  const workerEvents = [];
  vm.runInNewContext(sw, {
    self: { define: true, skipWaiting() {}, addEventListener: event => workerEvents.push(event) },
    define: (_deps, initialize) => initialize({
      clientsClaim() {}, precacheAndRoute() {}, cleanupOutdatedCaches() {}, registerRoute() {},
      NavigationRoute: function () {}, createHandlerBoundToURL() {}
    })
  });
  assert.equal(workerEvents.includes('push'), false);
  record('P13_BUILT_ASSETS', { classesUsedButNotGenerated: absentSelectors, pushFilePrecached: sw.includes('sw-push'), generatedWorkerRegistersPushHandler: workerEvents.includes('push') });

  const output = { timestamp: new Date().toISOString(), node: process.version, scope: 'Local disposable HTTP server; actual transpiled API client; extracted App.loadData callback; no production requests', defectProbesConfirmed: results.length, results };
  fs.writeFileSync(new URL('./results.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
  console.log(`Confirmed ${results.length} defect probes; results.json written.`);
} finally {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
