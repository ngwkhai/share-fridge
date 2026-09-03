import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { runMigrations } from '../server/migrate.js';
import { createPostgresRepository } from '../server/repository.js';
import { HttpError } from '../server/http.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration. No test was skipped. Use a disposable database.');
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5, connectionTimeoutMillis: 3000 });
const repository = createPostgresRepository({ pool });
const ownedCodes = [];

async function code() {
  for (let n = 0; n < 50; n++) {
    const candidate = String(crypto.randomInt(100000, 1000000));
    if (!(await pool.query('select 1 from public.rooms where code=$1', [candidate])).rowCount) { ownedCodes.push(candidate); return candidate; }
  }
  throw new Error('Could not allocate test room');
}
const food = (roomCode, overrides = {}) => ({
  id: crypto.randomUUID(), room_code: roomCode, name: 'C025 fixture', quantity: '1', compartment: 'DOOR', container_tag: '',
  added_date: new Date().toISOString(), expiry_date: new Date(Date.now() + 86400000).toISOString(), status: 'FRESH',
  photo_url: null, storage_path: null, notes: null, created_by: 'tester', consumed_by: null, consumed_at: null, ...overrides,
});

test.before(async () => { const client = await pool.connect(); await runMigrations(pool); client.release(); });
test.after(async () => {
  if (ownedCodes.length) await pool.query('delete from public.rooms where code=any($1::text[])', [ownedCodes]);
  await pool.end();
});

test('claimAttachment inside createFood is transactional: a bogus storage_path rolls back the whole insert', async () => {
  const roomCode = await code();
  await pool.query('insert into public.rooms(id,code,name,passcode_hash,salt) values($1,$2,$3,$4,$5)', [crypto.randomUUID(), roomCode, 'Room', 'x', 'y']);
  const draft = food(roomCode, { storage_path: 'rooms/'+roomCode+'/does-not-exist.jpg' });
  await assert.rejects(() => repository.createFood(draft), error => error instanceof HttpError && error.status === 404 && error.code === 'PHOTO_NOT_FOUND');
  assert.equal(await repository.getFood(draft.id, roomCode), null, 'the food row must not exist after the photo claim failed');
});

test('a staged upload can be attached exactly once, and cannot be re-attached to a second food', async () => {
  const roomCode = await code();
  await pool.query('insert into public.rooms(id,code,name,passcode_hash,salt) values($1,$2,$3,$4,$5)', [crypto.randomUUID(), roomCode, 'Room', 'x', 'y']);
  const path = `rooms/${roomCode}/${crypto.randomUUID()}.jpg`;
  await repository.registerStaged(roomCode, path, 'hash1', 'image/jpeg', 500, null);
  const first = food(roomCode, { storage_path: path });
  await repository.createFood(first);
  const second = food(roomCode, { storage_path: path });
  await assert.rejects(() => repository.createFood(second), error => error.status === 404 && error.code === 'PHOTO_NOT_FOUND');
  assert.equal(await repository.getFood(second.id, roomCode), null);
});

test('replacing a food photo releases the old storage_path for cleanup and claims the new one atomically', async () => {
  const roomCode = await code();
  await pool.query('insert into public.rooms(id,code,name,passcode_hash,salt) values($1,$2,$3,$4,$5)', [crypto.randomUUID(), roomCode, 'Room', 'x', 'y']);
  const oldPath = `rooms/${roomCode}/${crypto.randomUUID()}.jpg`, newPath = `rooms/${roomCode}/${crypto.randomUUID()}.jpg`;
  await repository.registerStaged(roomCode, oldPath, 'h1', 'image/jpeg', 100, null);
  await repository.registerStaged(roomCode, newPath, 'h2', 'image/jpeg', 100, null);
  const draft = food(roomCode, { storage_path: oldPath });
  await repository.createFood(draft);
  await repository.updateFood(draft.id, roomCode, { storage_path: newPath });
  const oldRow = (await pool.query('select state from sharefridge_private.photo_uploads where storage_path=$1', [oldPath])).rows[0];
  const newRow = (await pool.query('select state,food_id from sharefridge_private.photo_uploads where storage_path=$1', [newPath])).rows[0];
  assert.equal(oldRow.state, 'pending_delete');
  assert.equal(newRow.state, 'attached');
  assert.equal(newRow.food_id, draft.id);
  // Saving the same photo again (no actual change) must not release-then-fail to reclaim it.
  await repository.updateFood(draft.id, roomCode, { storage_path: newPath });
  const unchanged = (await pool.query('select state from sharefridge_private.photo_uploads where storage_path=$1', [newPath])).rows[0];
  assert.equal(unchanged.state, 'attached');
});

test('deleting a food releases its attached photo for cleanup', async () => {
  const roomCode = await code();
  await pool.query('insert into public.rooms(id,code,name,passcode_hash,salt) values($1,$2,$3,$4,$5)', [crypto.randomUUID(), roomCode, 'Room', 'x', 'y']);
  const path = `rooms/${roomCode}/${crypto.randomUUID()}.jpg`;
  await repository.registerStaged(roomCode, path, 'h', 'image/jpeg', 100, null);
  const draft = food(roomCode, { storage_path: path });
  await repository.createFood(draft);
  assert.equal(await repository.deleteFood(draft.id, roomCode), true);
  const row = (await pool.query('select state from sharefridge_private.photo_uploads where storage_path=$1', [path])).rows[0];
  assert.equal(row.state, 'pending_delete');
});

test('an Idempotency-Key replay only matches within the same room, and claimCleanup sweeps stale staged rows into pending_delete', async () => {
  const roomA = await code(), roomB = await code();
  for (const roomCode of [roomA, roomB]) await pool.query('insert into public.rooms(id,code,name,passcode_hash,salt) values($1,$2,$3,$4,$5)', [crypto.randomUUID(), roomCode, 'Room', 'x', 'y']);
  await repository.registerStaged(roomA, `rooms/${roomA}/a.jpg`, 'hh', 'image/jpeg', 10, 'shared-key');
  assert.equal(await repository.findByIdempotencyKey(roomA, 'shared-key') !== null, true);
  assert.equal(await repository.findByIdempotencyKey(roomB, 'shared-key'), null, 'idempotency keys are room-scoped, not global');

  const stalePath = `rooms/${roomA}/${crypto.randomUUID()}.jpg`;
  await repository.registerStaged(roomA, stalePath, 'stale', 'image/jpeg', 10, null);
  await pool.query("update sharefridge_private.photo_uploads set created_at=clock_timestamp()-interval '2 hours' where storage_path=$1", [stalePath]);
  const claimed = await repository.claimCleanup(10, 3600);
  assert.ok(claimed.some(row => row.storage_path === stalePath));
  const row = (await pool.query('select state from sharefridge_private.photo_uploads where storage_path=$1', [stalePath])).rows[0];
  assert.equal(row.state, 'pending_delete');
  await repository.finishCleanup(stalePath, true);
  assert.equal((await pool.query('select state from sharefridge_private.photo_uploads where storage_path=$1', [stalePath])).rows[0].state, 'deleted');
});
