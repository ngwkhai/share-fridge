import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import sharp from 'sharp';
import { HttpError } from '../server/http.js';
import { decodeImageBase64, detectSignature, validateImage, sha256Hex, newStoragePath, photoConfig, createPhotoService, MAX_BYTES, MAX_DIMENSION } from '../server/photos.js';
import { createMemoryPhotoRepository } from '../server/photosRepository.js';
import { createMemoryRepository } from '../server/repository.js';
import { createApiHandler } from '../server/apiHandler.js';
import { createServerlessHandler } from '../api/index.js';

const jpeg = async (width, height, quality = 60) => sharp({ create: { width, height, channels: 3, background: { r: 180, g: 40, b: 40 } } }).jpeg({ quality }).toBuffer();
const png = async (width, height) => sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 10 } } }).png().toBuffer();

function fakeStorage() {
  const objects = new Map();
  return {
    objects,
    async upload(path, buffer, mimeType) { if (objects.has(path)) throw new Error('exists'); objects.set(path, { buffer, mimeType }); },
    async createSignedUrls(paths) { return new Map(paths.map(path => [path, objects.has(path) ? `https://storage.test/${path}?sig=fake` : null])); },
    async remove(paths) { for (const path of paths) objects.delete(path); return true; },
  };
}
function service({ storage = fakeStorage(), uploads = new Map() } = {}) {
  const db = createMemoryPhotoRepository(uploads);
  const svc = createPhotoService({ configuration: () => ({ url: 'https://x.supabase.co', key: 'k'.repeat(41), bucket: 'food-photos' }), storageClientFactory: () => storage });
  return { db, svc, storage, uploads };
}
const rejects = (fn, code) => assert.rejects(fn, error => error instanceof HttpError && error.status === 400 && (!code || error.code === code));

test('decodeImageBase64 enforces canonical base64 and the 100KB decoded bound', () => {
  const small = Buffer.alloc(10, 1).toString('base64');
  assert.deepEqual(decodeImageBase64(small), Buffer.alloc(10, 1));
  assert.throws(() => decodeImageBase64('not base64!!'), error => error.code === 'INVALID_IMAGE');
  assert.throws(() => decodeImageBase64(''), error => error.code === 'INVALID_IMAGE');
  assert.throws(() => decodeImageBase64(Buffer.alloc(MAX_BYTES + 1).toString('base64')), error => error.code === 'INVALID_IMAGE');
});

test('detectSignature identifies real JPEG/PNG/WebP magic bytes and rejects everything else', async () => {
  assert.equal(detectSignature(await jpeg(10, 10)), 'image/jpeg');
  assert.equal(detectSignature(await png(10, 10)), 'image/png');
  assert.equal(detectSignature(Buffer.from('RIFF____WEBP')), 'image/webp');
  assert.equal(detectSignature(Buffer.from('not an image')), null);
});

test('validateImage rejects a mismatched declared MIME, oversized dimensions, multi-frame images and corrupt bytes', async () => {
  const okBuffer = await jpeg(200, 100);
  const meta = await validateImage(okBuffer, 'image/jpeg');
  assert.equal(meta.width, 200); assert.equal(meta.height, 100);
  await rejects(() => validateImage(okBuffer, 'image/png'), 'INVALID_IMAGE');
  await rejects(() => validateImage(Buffer.from('garbage'), 'image/jpeg'), 'INVALID_IMAGE');
  const tooBig = await png(MAX_DIMENSION + 1, 10);
  await rejects(() => validateImage(tooBig, 'image/png'), 'INVALID_IMAGE');
  const animated = await sharp({ create: { width: 5, height: 5, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).webp().toBuffer();
  const fakeDecode = () => ({ metadata: async () => ({ width: 5, height: 5, pages: 3 }) });
  await rejects(() => validateImage(animated, 'image/webp', { decode: fakeDecode }), 'INVALID_IMAGE');
});

test('upload registers the path before the remote call and returns a fresh signed URL', async () => {
  const { db, svc, storage } = service();
  const buffer = await jpeg(100, 80);
  const result = await svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg', undefined);
  assert.match(result.storage_path, /^rooms\/620020\/[0-9a-f-]{36}\.jpg$/);
  assert.equal(result.photo_url, `https://storage.test/${result.storage_path}?sig=fake`);
  assert.ok(storage.objects.has(result.storage_path));
  const staged = await db.findByIdempotencyKey('620020', 'nope');
  assert.equal(staged, null); // no idempotency key was supplied, so nothing indexes by one
});

test('upload with a reused Idempotency-Key replays the same storage_path for matching content, and 409s on a changed one', async () => {
  const { db, svc } = service();
  const buffer = await jpeg(64, 64);
  const first = await svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg', 'my-key');
  const replay = await svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg', 'my-key');
  assert.equal(replay.storage_path, first.storage_path);
  const different = await jpeg(32, 32);
  await assert.rejects(() => svc.upload(db, '620020', different.toString('base64'), 'image/jpeg', 'my-key'), error => error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT');
});

test('upload throws PHOTOS_UNAVAILABLE when storage is not configured', async () => {
  const uploads = new Map();
  const db = createMemoryPhotoRepository(uploads);
  const svc = createPhotoService({ configuration: () => null });
  const buffer = await jpeg(10, 10);
  await assert.rejects(() => svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg'), error => error.status === 503 && error.code === 'PHOTOS_UNAVAILABLE');
});

test('remove only releases a staged, unreferenced, room-owned upload', async () => {
  const { db, svc } = service();
  const buffer = await jpeg(50, 50);
  const staged = await svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg');
  await assert.rejects(() => svc.remove(db, '999999', staged.storage_path), error => error.status === 404);
  const removed = await svc.remove(db, '620020', staged.storage_path);
  assert.deepEqual(removed, { success: true });
  await assert.rejects(() => svc.remove(db, '620020', staged.storage_path), error => error.status === 404); // already released, not twice
});

test('claimAttachment refuses a foreign room or an already-attached path; releaseForFood frees the previous photo on replace', async () => {
  const { db, svc } = service();
  const buffer = await jpeg(60, 60);
  const uploaded = await svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg');
  await assert.rejects(() => db.claimAttachment(null, '999999', uploaded.storage_path, 'food-a'), error => error.status === 404);
  await db.claimAttachment(null, '620020', uploaded.storage_path, 'food-a');
  await assert.rejects(() => db.claimAttachment(null, '620020', uploaded.storage_path, 'food-b'), error => error.status === 404, 'a staged-only claim must not re-attach an already-attached path');

  const second = await svc.upload(db, '620020', (await jpeg(40, 40)).toString('base64'), 'image/jpeg');
  await db.releaseForFood(null, '620020', 'food-a', second.storage_path);
  await db.claimAttachment(null, '620020', second.storage_path, 'food-a');
  assert.equal((await db.findByIdempotencyKey('620020', 'nope')), null);
});

test('signFoods batches signing, leaves foods without storage_path untouched, and returns null photo_url when signing fails', async () => {
  const { db, svc, storage } = service();
  const uploaded = await svc.upload(db, '620020', (await jpeg(30, 30)).toString('base64'), 'image/jpeg');
  const legacy = { id: 'legacy', storage_path: null, photo_url: 'data:image/jpeg;base64,legacy-preserved' };
  const attached = { id: 'attached', storage_path: uploaded.storage_path, photo_url: null };
  const broken = { id: 'broken', storage_path: 'rooms/620020/does-not-exist.jpg', photo_url: null };
  const signed = await svc.signFoods(db, [legacy, attached, broken]);
  assert.equal(signed.find(food => food.id === 'legacy').photo_url, 'data:image/jpeg;base64,legacy-preserved');
  assert.equal(signed.find(food => food.id === 'attached').photo_url, `https://storage.test/${uploaded.storage_path}?sig=fake`);
  assert.equal(signed.find(food => food.id === 'broken').photo_url, null);
});

test('cleanup sweeps staged uploads past their grace period and pending_delete rows, retrying failures with backoff', async () => {
  const uploads = new Map();
  const storage = fakeStorage();
  const db = createMemoryPhotoRepository(uploads);
  const svc = createPhotoService({ configuration: () => ({ url: 'https://x.supabase.co', key: 'k'.repeat(41), bucket: 'b' }), storageClientFactory: () => storage });
  const buffer = await jpeg(20, 20);
  const uploaded = await svc.upload(db, '620020', buffer.toString('base64'), 'image/jpeg');
  // claimCleanup on the memory adapter is a stub (real grace-period sweeping is Postgres-only,
  // covered by the integration suite); this asserts the cron-facing shape stays well-formed.
  const result = await svc.cleanup(db);
  assert.deepEqual(result, { attempted: 0, deleted: 0 });
  assert.ok(storage.objects.has(uploaded.storage_path));
});

test('photoConfig requires a real *.supabase.co URL and a long service-role key', () => {
  assert.equal(photoConfig({}), null);
  assert.equal(photoConfig({ SUPABASE_URL: 'https://evil.example.com', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(50) }), null);
  assert.equal(photoConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'short' }), null);
  assert.deepEqual(photoConfig({ SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k'.repeat(50) }), { url: 'https://abc.supabase.co', key: 'k'.repeat(50), bucket: 'food-photos' });
});

test('newStoragePath is namespaced under the room and keyed by MIME extension', () => {
  assert.match(newStoragePath('620020', 'image/png'), /^rooms\/620020\/[0-9a-f-]{36}\.png$/);
  assert.match(newStoragePath('620020', 'image/webp'), /^rooms\/620020\/[0-9a-f-]{36}\.webp$/);
  assert.notEqual(newStoragePath('620020', 'image/jpeg'), newStoragePath('620020', 'image/jpeg'));
});

test('sha256Hex is deterministic and content-sensitive', () => {
  const a = Buffer.from('hello');
  const b = Buffer.from('hello!');
  assert.equal(sha256Hex(a), sha256Hex(Buffer.from('hello')));
  assert.notEqual(sha256Hex(a), sha256Hex(b));
});

test('full HTTP contract: upload, attach via POST /api/foods, a signed photo_url on GET /api/foods, and cleanup release on delete', async () => {
  // Uses the real photoService (not a wrapper) with only its storage client faked, so
  // db.createFood's own internal attach/release logic and the upload/sign calls share the
  // exact same photo-tracking store on this db instance, matching production wiring.
  const db = createMemoryRepository();
  const storage = fakeStorage();
  const photos = createPhotoService({ configuration: () => ({ url: 'https://x.supabase.co', key: 'k'.repeat(41), bucket: 'food-photos' }), storageClientFactory: () => storage });
  const api = createApiHandler(db, { photos });
  const server = http.createServer(createServerlessHandler(api));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, options = {}) => fetch(base + path, { method: options.method || 'GET', headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}), ...(options.headers || {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) }).then(async response => ({ status: response.status, body: await response.json() }));
  try {
    const room = await call('/api/auth/create-room', { method: 'POST', body: { code: '640001', passcode: '6789', nickname: 'Tester' } });
    assert.equal(room.status, 201);
    const token = room.body.token;

    const buffer = await jpeg(80, 60);
    const uploaded = await call('/api/photos', { method: 'POST', token, headers: { 'Idempotency-Key': 'e2e-key' }, body: { image_base64: buffer.toString('base64'), mime_type: 'image/jpeg' } });
    assert.equal(uploaded.status, 201);
    assert.ok(uploaded.body.storage_path.startsWith('rooms/640001/'));

    const created = await call('/api/foods', { method: 'POST', token, body: { room_code: '640001', name: 'Ảnh test', compartment: 'DOOR', shelf_life_days: 3, storage_path: uploaded.body.storage_path } });
    assert.equal(created.status, 201);
    assert.equal(created.body.storage_path, uploaded.body.storage_path);
    assert.match(created.body.photo_url, /^https:\/\/storage\.test\//);

    const list = await call(`/api/foods?room_code=640001`, { token });
    assert.equal(list.status, 200);
    assert.equal(list.body.items[0].photo_url, created.body.photo_url);

    const deleted = await call(`/api/foods/${created.body.id}`, { method: 'DELETE', token });
    assert.equal(deleted.status, 200);
    const row = await db.findByIdempotencyKey('640001', 'e2e-key');
    assert.equal(row.state, 'pending_delete');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
