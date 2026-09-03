import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { handleApiRequest, db } from './helpers.js';

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

test('E2E Full Roommate Flow: Room Creation -> Voice Add -> Expiry Warning -> AI Recipe Cook -> Shopping List', async () => {
  // Step 1: Create a room for 2 roommates
  const roomRes = await fetch(`${baseUrl}/api/auth/create-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Phòng 402 Triều Khúc', passcode: '6789' })
  });
  assert.strictEqual(roomRes.status, 201);
  const { room, token } = await roomRes.json();
  const roomCode = room.code;
  assert.ok(roomCode);

  // Step 2: Roommate A adds an urgent item via Voice NLP
  const voiceRes = await fetch(`${baseUrl}/api/ai/parse-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transcript: 'Rau cải ngồng 1 mớ để hộc rau' })
  });
  assert.strictEqual(voiceRes.status, 200);
  const { parsed } = await voiceRes.json();
  assert.strictEqual(parsed.compartment, 'CRISPER');

  // Save the parsed item into the fridge with 1 day expiry (Urgent)
  const addVegRes = await fetch(`${baseUrl}/api/foods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      room_code: roomCode,
      name: parsed.name,
      quantity: parsed.quantity,
      compartment: parsed.compartment,
      container_tag: 'Túi nilon đỏ',
      shelf_life_days: 1
    })
  });
  assert.strictEqual(addVegRes.status, 201);
  const vegFood = await addVegRes.json();
  assert.strictEqual(vegFood.status, 'COOK_SOON');

  // Step 3: Roommate A adds fresh meat in freezer
  const addMeatRes = await fetch(`${baseUrl}/api/foods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      room_code: roomCode,
      name: 'Thịt bò phi lê',
      quantity: '300g',
      compartment: 'FREEZER',
      container_tag: 'Hộp Lock nắp xanh',
      shelf_life_days: 10
    })
  });
  assert.strictEqual(addMeatRes.status, 201);

  // Step 4: Roommate B opens app and checks fridge overview
  const roomOverviewRes = await fetch(`${baseUrl}/api/rooms/${roomCode}`, { headers: { Authorization: `Bearer ${token}` } });
  const roomDetail = await roomOverviewRes.json();
  assert.strictEqual(roomDetail.active_food_count, 2);
  assert.strictEqual(roomDetail.urgent_food_count, 1);

  // Step 5: Roommate B asks "Hôm nay ăn gì?" AI suggests recipe from available items
  const recipeRes = await fetch(`${baseUrl}/api/ai/suggest-recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ room_code: roomCode })
  });
  assert.strictEqual(recipeRes.status, 200);
  const { suggestions } = await recipeRes.json();
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions[0].title);

  // Step 6: Roommate B cooks the meal and marks the urgent vegetable as consumed + adds to shopping list
  const consumeRes = await fetch(`${baseUrl}/api/foods/${vegFood.id}/consume`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ add_to_shopping_list: true })
  });
  assert.strictEqual(consumeRes.status, 200);
  const consumedItem = await consumeRes.json();
  assert.strictEqual(consumedItem.status, 'CONSUMED');

  // Step 7: Check Shopping List auto-updated
  const shopRes = await fetch(`${baseUrl}/api/shopping-items?room_code=${roomCode}`, { headers: { Authorization: `Bearer ${token}` } });
  const { items: shopItems } = await shopRes.json();
  assert.strictEqual(shopItems.length, 1);
  assert.strictEqual(shopItems[0].name, vegFood.name);

  // Step 8: Roommate goes shopping and checks off the item
  const toggleRes = await fetch(`${baseUrl}/api/shopping-items/${shopItems[0].id}/toggle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ is_bought: true })
  });
  assert.strictEqual(toggleRes.status, 200);
  const boughtItem = await toggleRes.json();
  assert.strictEqual(boughtItem.is_bought, true);
});
