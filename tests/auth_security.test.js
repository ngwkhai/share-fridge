import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { handleApiRequest } from '../server/apiHandler.js';
import { hashPasscode, verifyPasscode, generateSessionToken, verifySessionToken } from '../server/security.js';

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res);
    if (!handled) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(() => {
  server.close();
});

test('Security Utils: Hashing and Verification works', () => {
  const { hash, salt } = hashPasscode('8899');
  assert.ok(hash);
  assert.ok(salt);
  assert.strictEqual(verifyPasscode('8899', hash, salt), true);
  assert.strictEqual(verifyPasscode('0000', hash, salt), false);
});

test('Security Utils: Session Token Generation and Verification works', () => {
  const token = generateSessionToken('888999', 'Khải');
  assert.ok(token);
  const payload = verifySessionToken(token);
  assert.strictEqual(payload.room_code, '888999');
  assert.strictEqual(payload.nickname, 'Khải');
  assert.ok(payload.exp > Date.now());

  // Tampered token fails
  assert.strictEqual(verifySessionToken(token + 'tamper'), null);
});

test('API Auth: Create Room with Passcode and Join with Passcode', async () => {
  // 1. Create Room with passcode
  const createRes = await fetch(`${baseUrl}/api/auth/create-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '776655', name: 'Phòng Bí Mật', passcode: '9876', nickname: 'Chủ phòng' })
  });
  assert.strictEqual(createRes.status, 201);
  const createData = await createRes.json();
  assert.strictEqual(createData.room.code, '776655');
  assert.ok(createData.token);

  // 2. Join with wrong passcode fails
  const wrongJoinRes = await fetch(`${baseUrl}/api/auth/join-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '776655', passcode: '0000', nickname: 'Bạn phòng' })
  });
  assert.strictEqual(wrongJoinRes.status, 401);

  // 3. Join with correct passcode succeeds
  const rightJoinRes = await fetch(`${baseUrl}/api/auth/join-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: '776655', passcode: '9876', nickname: 'Bạn phòng' })
  });
  assert.strictEqual(rightJoinRes.status, 200);
  const rightJoinData = await rightJoinRes.json();
  assert.strictEqual(rightJoinData.room.code, '776655');
  assert.ok(rightJoinData.token);
});

test('API Auth: Verify Token endpoint', async () => {
  const token = generateSessionToken('776655', 'Khải Test');
  const verifyRes = await fetch(`${baseUrl}/api/auth/verify-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
  assert.strictEqual(verifyRes.status, 200);
  const data = await verifyRes.json();
  assert.strictEqual(data.valid, true);
  assert.strictEqual(data.payload.room_code, '776655');
});
