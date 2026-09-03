import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { handleApiRequest, db } from './helpers.js';

let server;
let baseUrl;
let token;

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
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(() => {
  server.close();
});

test('GET /healthz returns ok and 200', async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'ok');
  assert.strictEqual(data.version, '1.0.0');
  assert.ok(data.timestamp);
});

test('GET /api/openapi.json returns valid spec', async () => {
  const res = await fetch(`${baseUrl}/api/openapi.json`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.openapi, '3.0.0');
  assert.ok(data.paths['/healthz']);
  assert.ok(data.paths['/api/rooms']);
  assert.ok(data.paths['/api/foods']);
});

test('POST /api/rooms and GET /api/rooms/:code works', async () => {
  const postRes = await fetch(`${baseUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code: '998877', name: 'Phòng Test E2E', passcode: '6789' })
  });
  assert.strictEqual(postRes.status, 201);
  const newRoom = await postRes.json();
  assert.strictEqual(newRoom.code, '998877');
  assert.strictEqual(newRoom.name, 'Phòng Test E2E');

  const joinRes = await fetch(`${baseUrl}/api/auth/join-room`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '998877', passcode: '6789' }) });
  assert.strictEqual(joinRes.status, 200);
  token = (await joinRes.json()).token;
  const getRes = await fetch(`${baseUrl}/api/rooms/998877`, { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(getRes.status, 200);
  const roomDetail = await getRes.json();
  assert.strictEqual(roomDetail.code, '998877');
  assert.strictEqual(typeof roomDetail.active_food_count, 'number');
});

test('Food CRUD and status calculation works', async () => {
  const addRes = await fetch(`${baseUrl}/api/foods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      room_code: '998877',
      name: 'Rau cải ngồng',
      quantity: '500g',
      compartment: 'CRISPER',
      container_tag: 'Túi nilon trắng',
      shelf_life_days: 1
    })
  });
  assert.strictEqual(addRes.status, 201);
  const food = await addRes.json();
  assert.strictEqual(food.name, 'Rau cải ngồng');
  assert.strictEqual(food.status, 'COOK_SOON');

  const listRes = await fetch(`${baseUrl}/api/foods?room_code=998877&status=active`, { headers: { Authorization: `Bearer ${token}` } });
  const list = await listRes.json();
  assert.strictEqual(list.total, 1);

  const consumeRes = await fetch(`${baseUrl}/api/foods/${food.id}/consume`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ add_to_shopping_list: true })
  });
  const consumed = await consumeRes.json();
  assert.strictEqual(consumed.status, 'CONSUMED');

  const shopRes = await fetch(`${baseUrl}/api/shopping-items?room_code=998877`, { headers: { Authorization: `Bearer ${token}` } });
  const shopList = await shopRes.json();
  assert.strictEqual(shopList.items.length, 1);
  assert.strictEqual(shopList.items[0].name, 'Rau cải ngồng');
});

test('AI parse-voice endpoint returns structured JSON', async () => {
  const aiRes = await fetch(`${baseUrl}/api/ai/parse-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transcript: 'Thịt bò 3 lạng cất ngăn đông túi zip xanh' })
  });
  assert.strictEqual(aiRes.status, 200);
  const aiData = await aiRes.json();
  assert.strictEqual(aiData.parsed.compartment, 'FREEZER');
  assert.strictEqual(aiData.parsed.container_tag, 'Túi zip xanh');
  assert.strictEqual(aiData.parsed.quantity, '3 lạng');
});
