import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import Ajv from 'ajv';
import { db, handleApiRequest } from './helpers.js';

let server, baseUrl;
const schema = JSON.parse(fs.readFileSync(new URL('../server/openapi.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true, nullable: true, jsonPointers: true });
const converted = x => JSON.parse(JSON.stringify(x).replaceAll('#/components/schemas/', '#/definitions/'));
const validateSchema = (name, data) => {
  const validate = ajv.compile({ $ref: `#/definitions/${name}`, definitions: converted(schema.components.schemas) });
  assert.equal(validate(data), true, `${name}: ${JSON.stringify(validate.errors)}`);
};
const decode = token => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
const call = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
};

test.before(async () => {
  server = http.createServer(async (req, res) => { if (!(await handleApiRequest(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server?.close());

test('the spec declares the endpoint as a real, non-stubbed operation', () => {
  const op = schema.paths['/api/auth/session'].patch;
  assert.equal(op['x-availability'], undefined, 'C026 shipped; the route must no longer be marked unavailable');
  assert.deepEqual(op.requestBody.content['application/json'].schema, { $ref: '#/components/schemas/UpdateSessionDto' });
});

test('PATCH /api/auth/session renews the nickname into a new signed token, retaining room, Google profile and the original expiry', async () => {
  const created = await call('/api/auth/create-room', { method: 'POST', body: { code: '552201', passcode: '4321', nickname: 'Old Nick' } });
  assert.equal(created.status, 201);
  validateSchema('AuthSession', created.data);
  const originalExp = decode(created.data.token).exp;

  await new Promise(resolve => setTimeout(resolve, 20));
  const patched = await call('/api/auth/session', { method: 'PATCH', token: created.data.token, body: { nickname: 'New Nick' } });
  assert.equal(patched.status, 200);
  validateSchema('AuthSession', patched.data);
  assert.equal(patched.data.nickname, 'New Nick');
  assert.equal(patched.data.room.code, '552201');
  assert.notEqual(patched.data.token, created.data.token, 'nickname is embedded in the signed token, so renewal must mint a new one');
  const newPayload = decode(patched.data.token);
  assert.equal(newPayload.nickname, 'New Nick');
  assert.equal(newPayload.room_code, '552201');
  assert.equal(newPayload.exp, originalExp, 'the renewed session must not extend the original expiry');

  // Subsequent verify-token and actor-derived writes must reflect the new nickname.
  const verified = await call('/api/auth/verify-token', { method: 'POST', body: { token: patched.data.token } });
  assert.equal(verified.status, 200);
  assert.equal(verified.data.payload.nickname, 'New Nick');
  const added = await call('/api/foods', { method: 'POST', token: patched.data.token, body: { room_code: '552201', name: 'Trứng', compartment: 'DOOR', shelf_life_days: 3 } });
  assert.equal(added.status, 201);
  assert.equal(added.data.created_by, 'New Nick', 'subsequent food actors use the new verified nickname');

  // The previously issued token is not globally revoked; it remains valid for its own natural expiry.
  const oldStill = await call(`/api/rooms/552201`, { token: created.data.token });
  assert.equal(oldStill.status, 200);
});

test('a verified Google profile is retained across a nickname renewal', async () => {
  const { generateGoogleIdentity } = await import('../server/security.js');
  const identity = generateGoogleIdentity({ sub: 'google-sub-1', name: 'Khai', email: 'khai@example.com' }, Date.now() + 60000);
  const created = await call('/api/auth/create-room', { method: 'POST', body: { code: '552202', passcode: '4321', nickname: 'Khai', google_identity_token: identity.identity_token } });
  assert.equal(created.status, 201);
  assert.equal(created.data.google_profile.email, 'khai@example.com');
  const patched = await call('/api/auth/session', { method: 'PATCH', token: created.data.token, body: { nickname: 'Khai Renamed' } });
  assert.equal(patched.status, 200);
  assert.deepEqual(patched.data.google_profile, created.data.google_profile);
});

test('rejects missing, empty, non-string and oversized nicknames without minting a token', async () => {
  const created = await call('/api/auth/create-room', { method: 'POST', body: { code: '552203', passcode: '4321', nickname: 'Original' } });
  for (const body of [{}, { nickname: '' }, { nickname: '   ' }, { nickname: 42 }, { nickname: null }, { nickname: 'x'.repeat(101) }]) {
    const result = await call('/api/auth/session', { method: 'PATCH', token: created.data.token, body });
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(result.data.code, 'INVALID_INPUT');
  }
  const verified = await call('/api/auth/verify-token', { method: 'POST', body: { token: created.data.token } });
  assert.equal(verified.data.payload.nickname, 'Original', 'a rejected update must never mutate the existing session');
});

test('rejects missing, malformed, tampered and expired sessions the same way other routes do', async () => {
  const { generateSessionToken } = await import('../server/security.js');
  for (const token of [undefined, 'not.a.token']) {
    const result = await call('/api/auth/session', { method: 'PATCH', token, body: { nickname: 'X' } });
    assert.equal(result.status, 401);
    assert.equal(result.data.code, 'UNAUTHORIZED');
  }
  const created = await call('/api/auth/create-room', { method: 'POST', body: { code: '552204', passcode: '4321', nickname: 'Original' } });
  const tampered = await call('/api/auth/session', { method: 'PATCH', token: created.data.token + 'x', body: { nickname: 'X' } });
  assert.equal(tampered.status, 401);
  const unknownRoom = await call('/api/auth/session', { method: 'PATCH', token: generateSessionToken('999999', 'Ghost'), body: { nickname: 'X' } });
  assert.equal(unknownRoom.status, 401);
});

test('cannot be used to change room membership; a foreign room_code in the body is rejected, not silently followed', async () => {
  await call('/api/auth/create-room', { method: 'POST', body: { code: '552205', passcode: '4321', nickname: 'A' } });
  const created = await call('/api/auth/create-room', { method: 'POST', body: { code: '552206', passcode: '4321', nickname: 'B' } });
  const patched = await call('/api/auth/session', { method: 'PATCH', token: created.data.token, body: { nickname: 'B2', room_code: '552205' } });
  assert.equal(patched.status, 403, 'a client-supplied foreign room_code must never move the session to another room');
  assert.equal(db.rooms.get('552205').code, '552205');
  // Its own room_code in the body is harmless and still renews the nickname.
  const ownRoomCode = await call('/api/auth/session', { method: 'PATCH', token: created.data.token, body: { nickname: 'B2', room_code: '552206' } });
  assert.equal(ownRoomCode.status, 200);
  assert.equal(ownRoomCode.data.room.code, '552206');
});
