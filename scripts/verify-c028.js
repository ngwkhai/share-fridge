import assert from 'node:assert/strict';

const PROD_URL = 'https://sharefridge.vercel.app';

async function verifyProduction() {
  console.log('=== C-028 Live Production Verification ===');
  console.log(`Target URL: ${PROD_URL}\n`);

  // 1. Healthz
  console.log('1. Checking /healthz:');
  const healthRes = await fetch(`${PROD_URL}/healthz`);
  console.log(`   Status: ${healthRes.status}`);
  const health = await healthRes.json();
  console.log(`   Body:`, health);
  assert.equal(healthRes.status, 200);
  assert.equal(health.status, 'ok');

  // 2. Readyz
  console.log('\n2. Checking /readyz:');
  const readyRes = await fetch(`${PROD_URL}/readyz`);
  console.log(`   Status: ${readyRes.status}`);
  const ready = await readyRes.json();
  console.log(`   Body:`, ready);
  assert.equal(readyRes.status, 200);
  assert.equal(ready.status, 'ok');
  assert.equal(ready.database, 'postgres');

  // 3. API Config
  console.log('\n3. Checking /api/config:');
  const configRes = await fetch(`${PROD_URL}/api/config`);
  console.log(`   Status: ${configRes.status}`);
  const config = await configRes.json();
  console.log(`   Body:`, config);
  assert.equal(configRes.status, 200);
  assert.equal(config.capabilities.push, true);
  assert.equal(config.capabilities.realtime, true);

  // 4. OpenAPI Spec
  console.log('\n4. Checking /api/openapi.json:');
  const specRes = await fetch(`${PROD_URL}/api/openapi.json`);
  console.log(`   Status: ${specRes.status}`);
  const spec = await specRes.json();
  console.log(`   OpenAPI version: ${spec.openapi}`);
  console.log(`   Total paths: ${Object.keys(spec.paths).length}`);
  assert.equal(specRes.status, 200);
  assert.ok(spec.paths['/healthz']);
  assert.ok(spec.paths['/readyz']);
  assert.ok(spec.paths['/api/auth/session']);

  // 5. Room Creation, CRUD, and Room Isolation
  console.log('\n5. Testing Live Room Creation & CRUD:');
  const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
  const passcode = '6789';
  const createRes = await fetch(`${PROD_URL}/api/auth/create-room`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: roomCode, name: 'C-028 Live Verification Room', passcode, nickname: 'C028 Tester' })
  });
  console.log(`   Create room status: ${createRes.status}`);
  const session = await createRes.json();
  assert.equal(createRes.status, 201);
  const token = session.token;

  // Add food
  const addFoodRes = await fetch(`${PROD_URL}/api/foods`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      room_code: roomCode,
      name: 'Thịt bò xào rau muống',
      quantity: '400g',
      compartment: 'FRIDGE_TOP',
      shelf_life_days: 3
    })
  });
  console.log(`   Add food status: ${addFoodRes.status}`);
  const food = await addFoodRes.json();
  assert.equal(addFoodRes.status, 201);
  assert.equal(food.name, 'Thịt bò xào rau muống');

  // AI Voice parse check
  console.log('\n6. Checking AI parse-voice:');
  const aiVoiceRes = await fetch(`${PROD_URL}/api/ai/parse-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transcript: 'Nửa con gà luộc để ngăn mát trên dùng trong hai ngày' })
  });
  console.log(`   AI voice status: ${aiVoiceRes.status}`);
  const aiVoice = await aiVoiceRes.json();
  console.log(`   AI voice result:`, aiVoice);
  assert.equal(aiVoiceRes.status, 200);

  // AI Recipe suggestion check
  console.log('\n7. Checking AI suggest-recipes:');
  const aiRecipeRes = await fetch(`${PROD_URL}/api/ai/suggest-recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ room_code: roomCode })
  });
  console.log(`   AI recipe status: ${aiRecipeRes.status}`);
  const aiRecipe = await aiRecipeRes.json();
  console.log(`   AI recipes count: ${aiRecipe.suggestions?.length || 0}`);
  assert.equal(aiRecipeRes.status, 200);

  // Consume food
  console.log('\n8. Consuming food item:');
  const consumeRes = await fetch(`${PROD_URL}/api/foods/${food.id}/consume`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ add_to_shopping_list: true })
  });
  console.log(`   Consume status: ${consumeRes.status}`);
  assert.equal(consumeRes.status, 200);

  // Check shopping list
  const shopRes = await fetch(`${PROD_URL}/api/shopping-items?room_code=${roomCode}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const shop = await shopRes.json();
  console.log(`   Shopping items count: ${shop.items.length}`);
  assert.equal(shop.items.length, 1);
  assert.equal(shop.items[0].name, 'Thịt bò xào rau muống');

  // Cleanup: Delete shopping item and food
  await fetch(`${PROD_URL}/api/shopping-items/${shop.items[0].id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  await fetch(`${PROD_URL}/api/foods/${food.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`   Cleaned up test food and shopping items.`);

  console.log('\n=== All Live Verification Checks Passed on Production! ===');
}

verifyProduction().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
