import test from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { handleApiRequest } from '../server/apiHandler.js';
import { suggestRecipesWithGemini, parseVoiceWithGemini } from '../server/geminiService.js';

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
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
  const joinRes = await fetch(`${baseUrl}/api/auth/join-room`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: '123456', passcode: '1234' }) });
  assert.strictEqual(joinRes.status, 200);
  token = (await joinRes.json()).token;
});

test.after(() => {
  server.close();
});

test('Gemini Service: suggestRecipes returns valid structured recipes', async () => {
  const sampleFoods = [
    { id: '1', name: 'Thịt ba chỉ', quantity: '500g', compartment: 'FREEZER', days_remaining: 5, status: 'FRESH' },
    { id: '2', name: 'Rau muống', quantity: '1 mớ', compartment: 'CRISPER', days_remaining: 1, status: 'COOK_SOON' }
  ];

  const suggestions = await suggestRecipesWithGemini(sampleFoods, 'Ăn nhanh 15p');
  assert.ok(Array.isArray(suggestions));
  assert.ok(suggestions.length >= 1);
  const first = suggestions[0];
  assert.ok(first.title);
  assert.ok(first.cook_time_minutes > 0);
  assert.ok(Array.isArray(first.ingredients_used));
  assert.ok(Array.isArray(first.instructions));
});

test('Gemini Service: parseVoice parses Vietnamese complex sentence', async () => {
  const result = await parseVoiceWithGemini('Cất 5 lạng thịt bò vào ngăn đông túi zip xanh');
  assert.ok(result.parsed);
  assert.strictEqual(result.parsed.compartment, 'FREEZER');
  assert.strictEqual(result.parsed.container_tag, 'Túi zip xanh');
  assert.strictEqual(result.parsed.quantity, '5 lạng');
  assert.ok(result.parsed.shelf_life_days > 0);
});

test('API Endpoints: /api/ai/suggest-recipes and /api/ai/parse-voice respond via HTTP', async () => {
  const parseRes = await fetch(`${baseUrl}/api/ai/parse-voice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transcript: 'Trứng gà 10 quả để cánh tủ' })
  });
  assert.strictEqual(parseRes.status, 200);
  const parseData = await parseRes.json();
  assert.strictEqual(parseData.parsed.compartment, 'DOOR');

  const recipeRes = await fetch(`${baseUrl}/api/ai/suggest-recipes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ room_code: '123456' })
  });
  assert.strictEqual(recipeRes.status, 200);
  const recipeData = await recipeRes.json();
  assert.ok(recipeData.suggestions.length > 0);
  assert.ok(recipeData.generated_at);
});
