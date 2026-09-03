import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createServerlessHandler } from '../api/index.js';
import { db, handleApiRequest } from './helpers.js';
const handler = createServerlessHandler(handleApiRequest);
import { generateSessionToken, hashPasscode, verifyPasscode, verifySessionToken } from '../server/security.js';

let server, baseUrl, first, second, food, shopping;
const call = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
};

test.before(async () => {
  server = http.createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const code of ['681801', '681802']) {
    const result = await call('/api/auth/create-room', { method: 'POST', body: { code, passcode: '6789', nickname: `Member ${code}` } });
    assert.equal(result.status, 201);
    if (!first) first = result.data; else second = result.data;
  }
  const added = await call('/api/foods', { method: 'POST', token: first.token, body: { room_code: first.room.code, name: 'Protected food', compartment: 'CRISPER', shelf_life_days: 2, created_by: 'Spoofed actor' } });
  assert.equal(added.status, 201);
  food = added.data;
  const addedShop = await call('/api/shopping-items', { method: 'POST', token: first.token, body: { room_code: first.room.code, name: 'Protected shopping' } });
  assert.equal(addedShop.status, 201);
  shopping = addedShop.data;
});
test.after(() => server?.close());

function privateOperations() {
  return [
    [`/api/rooms/${first.room.code}`, 'GET'],
    [`/api/foods?room_code=${first.room.code}`, 'GET'],
    ['/api/foods', 'POST', { room_code: first.room.code, name: 'Intrusion' }],
    [`/api/foods/${food.id}/consume`, 'PATCH', {}],
    [`/api/foods/${food.id}`, 'DELETE'],
    [`/api/shopping-items?room_code=${first.room.code}`, 'GET'],
    ['/api/shopping-items', 'POST', { room_code: first.room.code, name: 'Intrusion' }],
    [`/api/shopping-items/${shopping.id}/toggle`, 'PATCH', { is_bought: true }],
    [`/api/shopping-items/${shopping.id}`, 'DELETE'],
    ['/api/ai/parse-voice', 'POST', { room_code: first.room.code, transcript: 'Rau' }],
    ['/api/ai/suggest-recipes', 'POST', { room_code: first.room.code }],
    ['/api/notifications/subscribe', 'POST', { room_code: first.room.code, subscription: {} }],
  ];
}

test('every data route rejects missing and malformed Bearer sessions', async () => {
  for (const [path, method, body] of privateOperations()) {
    for (const token of [undefined, 'not.a.token']) {
      const result = await call(path, { method, body, token });
      assert.equal(result.status, 401, `${method} ${path}`);
      assert.equal(result.data.code, 'UNAUTHORIZED');
    }
  }
});

test('a second room cannot read, mutate, consume, delete or subscribe in the first room', async () => {
  const before = JSON.stringify({ food: db.foods.get(food.id), shopping: db.shoppingItems.get(shopping.id), subscribers: [...db.subscribers] });
  for (const [path, method, body] of privateOperations()) {
    const result = await call(path, { method, body, token: second.token });
    assert.ok([403, 404].includes(result.status), `${method} ${path}: ${result.status}`);
  }
  assert.equal(JSON.stringify({ food: db.foods.get(food.id), shopping: db.shoppingItems.get(shopping.id), subscribers: [...db.subscribers] }), before);
  const own = await call(`/api/foods?room_code=${first.room.code}`, { token: first.token });
  assert.equal(own.status, 200);
  assert.ok(own.data.items.some(item => item.id === food.id));
});

test('duplicate room creation through either endpoint preserves credentials and records', async () => {
  const before = structuredClone(db.rooms.get(first.room.code));
  for (const path of ['/api/auth/create-room', '/api/rooms']) {
    const result = await call(path, { method: 'POST', body: { code: first.room.code, passcode: '9999', name: 'Takeover' } });
    assert.equal(result.status, 409);
    assert.equal(result.data.code, 'ROOM_EXISTS');
    assert.deepEqual(db.rooms.get(first.room.code), before);
  }
  const rejected = await call('/api/auth/join-room', { method: 'POST', body: { code: first.room.code, passcode: '9999' } });
  assert.equal(rejected.status, 401);
  const joined = await call('/api/auth/join-room', { method: 'POST', body: { code: first.room.code, passcode: '6789' } });
  assert.equal(joined.status, 200);
  assert.ok(db.foods.has(food.id));
});

test('room responses whitelist public fields including verify-token and legacy creation', async () => {
  const results = [first.room];
  for (const [path, options] of [
    [`/api/rooms/${first.room.code}`, { token: first.token }],
    ['/api/auth/verify-token', { method: 'POST', body: { token: first.token } }],
    ['/api/rooms', { method: 'POST', body: { code: '681803', passcode: '9876' } }],
  ]) {
    const result = await call(path, options);
    assert.ok([200, 201].includes(result.status));
    results.push(result.data.room ?? result.data);
  }
  for (const room of results) {
    assert.ok(room.id && room.code && room.name && room.created_at);
    assert.ok(Object.keys(room).every(key => ['id', 'code', 'name', 'created_at', 'active_food_count', 'urgent_food_count'].includes(key)));
  }
});

test('room code, mandatory PIN and nickname types/bounds are validated on both create routes', async () => {
  for (const path of ['/api/rooms', '/api/auth/create-room']) {
    for (const body of [
      { code: '681810' }, { code: '681810', passcode: '123' }, { code: '681810', passcode: '1234567' },
      { code: '681810', passcode: 1234 }, { code: 'invalid', passcode: '1234' },
      { code: 681810, passcode: '1234' }, { code: '681810', passcode: '1234', nickname: {} },
      { code: '681810', passcode: '1234', name: 'x'.repeat(101) },
    ]) {
      const result = await call(path, { method: 'POST', body });
      assert.equal(result.status, 400);
      assert.ok(result.data.error && result.data.code);
    }
  }
  assert.equal(db.rooms.has('681810'), false);
});

test('unknown-room and tampered tokens cannot authorize requests', async () => {
  for (const token of [generateSessionToken('681899'), first.token + 'tampered']) {
    assert.equal((await call(`/api/foods?room_code=${first.room.code}`, { token })).status, 401);
    const verification = await call('/api/auth/verify-token', { method: 'POST', body: { token } });
    assert.equal(verification.status, 401);
    assert.equal(verification.data.valid, false);
  }
});

test('a valid signature never substitutes for required well-typed unexpired session claims', () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'test-secret-with-more-than-thirty-two-characters-837294';
  const sign = payload => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url')}`;
  };
  try {
    const valid = { room_code: '681801', nickname: 'Member', exp: Date.now() + 60000 };
    for (const payload of [{ ...valid, exp: undefined }, { ...valid, exp: 0 }, { ...valid, exp: Date.now() }, { ...valid, exp: '9999999999999' }, { ...valid, exp: Date.now() + 40 * 86400000 }, { ...valid, nickname: {} }, { ...valid, room_code: 681801 }, { ...valid, room_code: 'bad' }]) {
      assert.equal(verifySessionToken(sign(payload)), null);
    }
    assert.deepEqual(verifySessionToken(sign(valid)), valid);
  } finally {
    if (original === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = original;
  }
});

test('production rejects absent/default/weak session secrets before inserting a room', async () => {
  const originalSecret = process.env.SESSION_SECRET, originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    for (const secret of [undefined, 'sharefridge-secure-salt-key-2026', 'x'.repeat(64)]) {
      if (secret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = secret;
      assert.throws(() => generateSessionToken('681801'), { code: 'SESSION_UNAVAILABLE' });
      const response = await call('/api/auth/create-room', { method: 'POST', body: { code: '681898', passcode: '6789' } });
      assert.equal(response.status, 503);
      assert.equal(response.data.code, 'DATABASE_UNAVAILABLE');
      assert.equal(db.rooms.has('681898'), false);
    }
  } finally {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = originalSecret;
    if (originalEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalEnvironment;
  }
});

test('malformed JSON is 400 and parsed serverless bodies complete without stream listeners', async () => {
  const malformed = await fetch(`${baseUrl}/api/auth/join-room`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'INVALID_JSON');
  for (const body of [{ code: first.room.code, passcode: '6789' }, JSON.stringify({ code: first.room.code, passcode: '6789' }), Buffer.from(JSON.stringify({ code: first.room.code, passcode: '6789' }))]) {
    let status, result;
    await handler({ url: '/api/auth/join-room', method: 'POST', headers: {}, body, on() { throw new Error('Stream already consumed'); } }, { writeHead(code) { status = code; }, end(value) { result = JSON.parse(value); } });
    assert.equal(status, 200);
    assert.equal(result.room.code, first.room.code);
  }
  const invalid = await call('/api/auth/join-room', { method: 'POST', body: [] });
  assert.equal(invalid.status, 400);
});

test('actor fields are derived from the session', async () => {
  assert.equal(food.created_by, first.nickname);
  const consumed = await call(`/api/foods/${food.id}/consume`, { method: 'PATCH', token: first.token, body: { consumed_by: 'Spoofed actor' } });
  assert.equal(consumed.status, 200);
  assert.equal(consumed.data.consumed_by, first.nickname);
});

test('legacy password hashes remain readable and malformed hashes fail without throwing', () => {
  const salt = 'legacy-salt';
  const hash = crypto.pbkdf2Sync('6789', salt, 1000, 32, 'sha256').toString('hex');
  assert.equal(verifyPasscode('6789', hash, salt), true);
  assert.equal(verifyPasscode('6789', 'invalid', salt), false);
  const modern = hashPasscode('6789');
  assert.equal(verifyPasscode('6789', modern.hash, modern.salt), true);
  assert.equal(verifyPasscode('0000', modern.hash, modern.salt), false);
});

test('failures never expose internal exception details', async () => {
  const saved = db.rooms.get;
  db.rooms.get = () => { throw new Error('private-database-secret'); };
  try {
    const result = await call('/api/auth/verify-token', { method: 'POST', body: { token: first.token } });
    assert.equal(result.status, 500);
    assert.deepEqual(result.data, { error: 'Internal server error', code: 'INTERNAL_ERROR' });
  } finally { db.rooms.get = saved; }
});

test('failed PIN attempts are throttled even when the caller spoofs X-Forwarded-For', async () => {
  // Reset only this fixture's limiter keys; the proof does not depend on which
  // credential-failure assertions ran earlier in this test process.
  await db.clearRateLimit(crypto.createHash('sha256').update('join-ip:127.0.0.1').digest('hex'));
  await db.clearRateLimit(crypto.createHash('sha256').update(`join-room:${second.room.code}`).digest('hex'));
  for (let index = 0; index < 6; index++) {
    const result = await call('/api/auth/join-room', { method: 'POST', body: { code: second.room.code, passcode: '0000' }, headers: { 'x-forwarded-for': `198.51.100.${index}` } });
    assert.equal(result.status, index < 5 ? 401 : 429);
  }
});


test('served OpenAPI declares auth routes, protected operations and safe error/room schemas', async () => {
  const { status, data: spec } = await call('/api/openapi.json');
  assert.equal(status, 200);
  for (const name of ['create-room', 'join-room', 'verify-token']) assert.ok(spec.paths[`/api/auth/${name}`]?.post);
  assert.equal(spec.components.securitySchemes.RoomBearer.scheme, 'bearer');
  for (const [path, operations] of Object.entries(spec.paths)) {
    if (path === '/healthz' || path === '/readyz' || path === '/api/rooms' || path.startsWith('/api/auth/')) continue;
    for (const operation of Object.values(operations)) {
      assert.deepEqual(operation.security, [{ RoomBearer: [] }], path);
      assert.ok(operation.responses['401'] && operation.responses['403']);
    }
  }
  assert.deepEqual(spec.components.schemas.Error.required, ['error', 'code']);
  assert.ok(!spec.components.schemas.Room.properties.passcode_hash);
  assert.ok(spec.paths['/api/rooms'].post.responses['409']);
  assert.ok(spec.components.schemas.RoomCreate.required.includes('passcode'));
});
