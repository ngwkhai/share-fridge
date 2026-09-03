import test from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { handleApiRequest } from './helpers.js';

test('Session Cache & Room Auto-Creation: API creates room with passcode and verifies token', async () => {
  const server = http.createServer(async (req, res) => {
    await handleApiRequest(req, res);
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // 1. Create Room with Passcode
    const createRes = await fetch(`${baseUrl}/api/auth/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: '778899',
        name: 'Phòng SWR Test',
        passcode: '6677',
        nickname: 'KhaiTester'
      })
    });

    assert.strictEqual(createRes.status, 201);
    const createData = await createRes.json();
    assert.strictEqual(createData.room.code, '778899');
    assert.strictEqual(createData.room.name, 'Phòng SWR Test');
    assert.ok(createData.token, 'Must return session token');

    // 2. Verify Session Token
    const verifyRes = await fetch(`${baseUrl}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: createData.token })
    });

    assert.strictEqual(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.valid, true);
    assert.strictEqual(verifyData.payload.room_code, '778899');
    assert.strictEqual(verifyData.payload.nickname, 'KhaiTester');

    // 3. Get Room Details with Token
    const roomRes = await fetch(`${baseUrl}/api/rooms/778899`, {
      headers: { 'Authorization': `Bearer ${createData.token}` }
    });
    assert.strictEqual(roomRes.status, 200);
    const roomData = await roomRes.json();
    assert.strictEqual(roomData.code, '778899');
    assert.strictEqual(roomData.name, 'Phòng SWR Test');
  } finally {
    server.close();
  }
});
