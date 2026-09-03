import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { handleApiRequest } from './helpers.js';
import { suggestRecipesWithGemini, parseVoiceWithGemini, fallbackParseVoice, callGeminiApi } from '../server/geminiService.js';

const food = (id, name, extra = {}) => ({ id, room_code: '623023', name, quantity: '500g', compartment: 'FREEZER', expiry_date: new Date(Date.now() + 86400000).toISOString(), days_remaining: 1, status: 'COOK_SOON', ...extra });
const inventory = [food('pork', 'Thịt ba chỉ'), food('veg', 'Rau muống'), food('old', 'Trứng gà', { status: 'EXPIRED', expiry_date: '2020-01-01T00:00:00.000Z' }), food('used', 'Trứng vịt', { status: 'CONSUMED' })];
const recipe = { title: 'Thịt rang', cook_time_minutes: 20, food_ids: ['pork'], ingredients_used: ['Thịt ba chỉ'], ingredients_missing: ['Nước mắm'], instructions: ['Thái thịt và rang đến khi chín.'] };
const envelope = value => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));
const provider = value => ({ fetchImpl: async () => envelope(value) });
let server, base, token;
test.before(async () => {
  process.env.GEMINI_API_KEY = '';
  server = http.createServer(async (req, res) => { if (!(await handleApiRequest(req, res))) { res.writeHead(404); res.end('{}'); } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(base + '/api/auth/create-room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '623023', passcode: '1234' }) });
  assert.equal(result.status, 201); token = (await result.json()).token;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); });
const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

test('Vietnamese extraction fixes actual preview half-kilo/7-day baseline, explicit locations, zero and packaging', () => {
  assert.deepEqual(fallbackParseVoice('Nửa ký thịt ba chỉ trong hộp xanh, ngăn đông, dùng trong 7 ngày').parsed, { name: 'thịt ba chỉ', quantity: '0.5 kg', compartment: 'FREEZER', container_tag: 'Hộp xanh', shelf_life_days: 7 });
  assert.deepEqual(fallbackParseVoice('Cất nửa cân thịt bò vào ngăn đông túi zip xanh').parsed, { name: 'thịt bò', quantity: '0.5 kg', compartment: 'FREEZER', container_tag: 'Túi zip xanh', shelf_life_days: 14 });
  assert.equal(fallbackParseVoice('1/2 kg thịt bò').parsed.quantity, '0.5 kg');
  assert.equal(fallbackParseVoice('Rau muống ngăn mát dưới dùng trong 0 ngày').parsed.compartment, 'FRIDGE_BOTTOM');
  assert.equal(fallbackParseVoice('Rau muống ngăn mát dưới dùng trong 0 ngày').parsed.shelf_life_days, 0);
  assert.deepEqual(fallbackParseVoice('2 hộp sữa chua cánh tủ').parsed, { name: 'sữa chua', quantity: '2 hộp', compartment: 'DOOR', container_tag: '', shelf_life_days: 7 });
  for (const days of ['1000', '-1', '1.5', '366']) assert.throws(() => fallbackParseVoice(`Thịt bò dùng trong ${days} ngày`), error => error.status === 400 && error.code === 'INVALID_SHELF_LIFE');
});

test('provider request uses structured schema, omits expired inventory, validates source and canonical owned IDs', async () => {
  let request;
  const result = await suggestRecipesWithGemini(inventory, '', 'fixture-key', { fetchImpl: async (url, options) => { request = { url, options, body: JSON.parse(options.body) }; return envelope([recipe]); } });
  assert.equal(result.source, 'gemini-2.5-flash');
  assert.deepEqual(result.suggestions[0].food_ids, ['pork']);
  assert.equal(new URL(request.url).search, '');
  assert.equal(request.options.headers['x-goog-api-key'], 'fixture-key');
  assert.equal(request.body.generationConfig.responseMimeType, 'application/json');
  assert.ok(request.body.generationConfig.responseJsonSchema);
  const sent = JSON.parse(request.body.contents[0].parts[0].text).inventory;
  assert.deepEqual(sent.map(item => item.id), ['pork', 'veg']);
});

test('malformed, foreign/missing/expired/consumed IDs and mismatched ingredient names never become provider success', async () => {
  const malformed = [null, {}, [], [{ ...recipe, title: '' }], [{ ...recipe, cook_time_minutes: '20' }], [{ ...recipe, instructions: [7] }], [{ ...recipe, food_ids: ['pork', 'pork'] }], [{ ...recipe, ingredients_used: ['Sữa chua'] }], ...['foreign', 'missing', 'old', 'used'].map(id => [{ ...recipe, food_ids: [id] }])];
  for (const value of malformed) {
    const result = await suggestRecipesWithGemini(inventory, '', 'fixture-key', provider(value));
    assert.equal(result.source, 'heuristic');
    assert.ok(result.suggestions.every(item => item.food_ids.every(id => ['pork', 'veg'].includes(id))));
  }
  const yogurt = await suggestRecipesWithGemini([food('yogurt', 'Sữa chua')]);
  assert.deepEqual(yogurt, { suggestions: [], source: 'heuristic' }, 'fallback cannot attach yogurt to an invented egg recipe');
  assert.deepEqual(await suggestRecipesWithGemini(inventory.slice(2)), { suggestions: [], source: 'heuristic' });
});

test('provider result is rechecked against expiry after a slow request', async () => {
  const soon = food('pork', 'Thịt ba chỉ', { expiry_date: new Date(Date.now() + 20).toISOString() });
  const result = await suggestRecipesWithGemini([soon], '', 'fixture-key', { fetchImpl: async () => { await new Promise(resolve => setTimeout(resolve, 40)); return envelope([recipe]); } });
  assert.deepEqual(result, { suggestions: [], source: 'heuristic' });
});

test('voice schema rejects invalid enums, numbers, bounds and keeps explicitly spoken zero', async () => {
  const good = { name: 'Thịt bò', quantity: '', compartment: 'FREEZER', container_tag: '', shelf_life_days: 0 };
  for (const value of [{ ...good, compartment: 'wrong' }, { ...good, shelf_life_days: '0' }, { ...good, shelf_life_days: -1 }, { ...good, shelf_life_days: 366 }, { ...good, name: 'x'.repeat(201) }, { ...good, quantity: {} }]) {
    assert.equal((await parseVoiceWithGemini('Thịt bò ngăn đông', 'fixture-key', provider(value))).source, 'heuristic');
  }
  const valid = await parseVoiceWithGemini('Thịt bò ngăn đông dùng trong 0 ngày', 'fixture-key', provider({ ...good, shelf_life_days: 14 }));
  assert.equal(valid.source, 'gemini-2.5-flash'); assert.equal(valid.parsed.shelf_life_days, 0);
});

test('transport aborts stalled actual HTTP response without retry, bounds bytes and never logs provider secrets', async () => {
  let calls = 0, closed = false;
  const fake = http.createServer((req, res) => { calls++; res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{'); res.on('close', () => { closed = true; }); });
  await new Promise((resolve, reject) => { fake.once('error', reject); fake.listen(0, '127.0.0.1', resolve); });
  const logs = [], warn = console.warn; console.warn = value => logs.push(value);
  try {
    const started = Date.now();
    assert.equal(await callGeminiApi('private-prompt', '', 'secret-sentinel', { timeoutMs: 50, fetchImpl: (_, options) => fetch(`http://127.0.0.1:${fake.address().port}`, options) }), null);
    assert.ok(Date.now() - started < 1000); assert.equal(calls, 1);
    await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(closed, true);
    let cancelled = false;
    const oversized = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(70000)); }, cancel() { cancelled = true; } });
    assert.equal(await callGeminiApi('', '', 'secret-sentinel', { fetchImpl: async () => new Response(oversized) }), null);
    assert.equal(cancelled, true);
    assert.equal(await callGeminiApi('', '', 'secret-sentinel', { fetchImpl: async () => new Response('private-provider-error', { status: 429 }) }), null);
    assert.equal(await callGeminiApi('', '', 'secret-sentinel', { fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'invalid JSON secret-sentinel' }] } }] })) }), null);
    assert.match(logs.join('\n'), /reason=timeout/); assert.match(logs.join('\n'), /reason=oversized_response/); assert.match(logs.join('\n'), /reason=http_error status=429/);
    assert.doesNotMatch(logs.join('\n'), /secret-sentinel|private-provider-error|private-prompt/);
  } finally { console.warn = warn; fake.closeAllConnections(); await new Promise(resolve => fake.close(resolve)); }
});

test('actual HTTP reports source and correct empty inventory, rejects invalid spoken dates', async () => {
  const response = await post('/api/ai/parse-voice', { transcript: 'Nửa ký thịt ba chỉ trong hộp xanh, ngăn đông, dùng trong 7 ngày' });
  assert.equal(response.status, 200); const voice = await response.json(); assert.equal(voice.source, 'heuristic'); assert.equal(voice.parsed.quantity, '0.5 kg'); assert.equal(voice.parsed.shelf_life_days, 7);
  for (const transcript of ['Thịt bò dùng trong -1 ngày', 'Thịt bò dùng trong 1000 ngày']) assert.equal((await post('/api/ai/parse-voice', { transcript })).status, 400);
  const recipes = await post('/api/ai/suggest-recipes', { room_code: '623023' });
  assert.equal(recipes.status, 200); const body = await recipes.json(); assert.equal(body.source, 'heuristic'); assert.deepEqual(body.suggestions, []); assert.ok(Date.parse(body.generated_at));
});
