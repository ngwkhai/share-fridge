import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const deployment = process.env.VERIFY_DEPLOYMENT;
const cli = process.env.VERCEL_CLI;
assert.ok(deployment && cli, 'Set VERIFY_DEPLOYMENT and VERCEL_CLI');
const checks = [];
async function call(path, method = 'GET', body, token) {
  const config = [`request = ${JSON.stringify(method)}`, 'header = "Content-Type: application/json"'];
  if (token) config.push(`header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`);
  if (body) config.push(`data = ${JSON.stringify(JSON.stringify(body))}`);
  const child = spawn(process.execPath, [cli, 'curl', path, '--deployment', deployment, '--', '--silent', '--show-error', '--config', '-', '--write-out', '\n%{http_code}'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', chunk => out += chunk);
  child.stderr.on('data', chunk => err += chunk);
  child.stdin.end(config.join('\n'));
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 0, `Vercel request failed: ${path} (output withheld)`);
  const split = out.lastIndexOf('\n');
  return { status: Number(out.slice(split + 1)), data: JSON.parse(out.slice(0, split)) };
}
function expect(name, response, status) {
  checks.push({ name, status: response.status, expected: status, passed: response.status === status });
  console.log(JSON.stringify(checks.at(-1)));
  assert.equal(response.status, status, name);
}
const roomA = String(crypto.randomInt(200000, 800000));
let roomB;
do { roomB = String(crypto.randomInt(200000, 800000)); } while (roomB === roomA);
const a = await call('/api/auth/create-room', 'POST', { code: roomA, passcode: '6819', nickname: 'Security audit A' });
expect('create disposable room A', a, 201);
const b = await call('/api/auth/create-room', 'POST', { code: roomB, passcode: '7328', nickname: 'Security audit B' });
expect('create disposable room B', b, 201);
assert.ok(!JSON.stringify(a.data.room).match(/hash|salt|passcode/));
const food = await call('/api/foods', 'POST', { room_code: roomA, name: 'Disposable audit item', compartment: 'CRISPER', shelf_life_days: 1 }, a.data.token);
expect('authenticated create', food, 201);
expect('unauthorized read', await call(`/api/foods?room_code=${roomA}`), 401);
expect('unauthorized write', await call('/api/foods', 'POST', { room_code: roomA, name: 'Intrusion' }), 401);
expect('cross-room read', await call(`/api/foods?room_code=${roomA}`, 'GET', undefined, b.data.token), 403);
expect('cross-room delete', await call(`/api/foods/${food.data.id}`, 'DELETE', undefined, b.data.token), 404);
for (const path of ['/api/auth/create-room', '/api/rooms']) expect(`duplicate ${path}`, await call(path, 'POST', { code: roomA, passcode: '9999', name: 'Takeover' }), 409);
expect('original credentials preserved', await call('/api/auth/join-room', 'POST', { code: roomA, passcode: '6819' }), 200);
const detail = await call(`/api/rooms/${roomA}`, 'GET', undefined, a.data.token);
expect('public room DTO', detail, 200);
assert.ok(!JSON.stringify(detail.data).match(/hash|salt|passcode/));
const spec = await call('/api/openapi.json');
expect('live OpenAPI', spec, 200);
assert.equal(spec.data.components.securitySchemes.RoomBearer.scheme, 'bearer');
expect('cleanup own disposable food', await call(`/api/foods/${food.data.id}`, 'DELETE', undefined, a.data.token), 200);
console.log(JSON.stringify({ deployment, spec_url: `${deployment}/api/openapi.json`, tested_at: new Date().toISOString(), checks: checks.length, passed: true, tokens_logged: false }));
