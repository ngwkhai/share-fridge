import crypto from 'node:crypto';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

export const MAX_BYTES = 102400; // 100 KiB, decoded input bytes; the contract's own bound.
export const MAX_DIMENSION = 1280;
export const BUCKET = 'food-photos';
const SIGN_TTL_SECONDS = 300;
const STAGED_GRACE_SECONDS = 3600;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const bad = message => { throw new HttpError(400, 'INVALID_IMAGE', message || 'Ảnh không hợp lệ.'); };

export function decodeImageBase64(value) {
  if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_BYTES * 4 / 3) + 8) bad();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) bad();
  const buffer = Buffer.from(value, 'base64');
  if (!buffer.length || buffer.toString('base64') !== value) bad();
  if (buffer.length > MAX_BYTES) bad('Ảnh vượt quá 100KB sau khi giải mã.');
  return buffer;
}

export function detectSignature(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function validateImage(buffer, declaredMime, { decode = sharp } = {}) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(declaredMime)) bad('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
  if (detectSignature(buffer) !== declaredMime) bad('Nội dung ảnh không khớp định dạng khai báo.');
  let metadata;
  try { metadata = await decode(buffer).metadata(); } catch { bad('Không thể đọc được ảnh.'); }
  if (!metadata || (metadata.pages || 1) > 1) bad('Chỉ chấp nhận ảnh một khung hình, không phải ảnh động.');
  if (!metadata.width || !metadata.height || metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) bad(`Kích thước ảnh phải từ 1 đến ${MAX_DIMENSION}px mỗi chiều.`);
  return metadata;
}

export function sha256Hex(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

export function newStoragePath(roomCode, mimeType) {
  return `rooms/${roomCode}/${crypto.randomUUID()}.${extensions[mimeType]}`;
}

export function photoConfig(env = process.env) {
  const url = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return null;
  if (typeof key !== 'string' || key.length < 40) return null;
  return { url, key, bucket: BUCKET };
}

export function createStorageClient({ url, key, bucket }) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const store = client.storage.from(bucket);
  return {
    async upload(path, buffer, mimeType) {
      const { error } = await store.upload(path, buffer, { contentType: mimeType, upsert: false });
      if (error) throw new Error(`STORAGE_UPLOAD_FAILED: ${error.message}`);
    },
    async createSignedUrls(paths, expiresInSeconds) {
      if (!paths.length) return new Map();
      const { data, error } = await store.createSignedUrls(paths, expiresInSeconds);
      if (error) return new Map(paths.map(path => [path, null]));
      return new Map((data || []).map(row => [row.path, row.error ? null : row.signedUrl]));
    },
    async remove(paths) {
      if (!paths.length) return true;
      const { error } = await store.remove(paths);
      return !error;
    },
  };
}

export function createPhotoService({ configuration = photoConfig, storageClientFactory = createStorageClient, decode = sharp, now = () => Date.now() } = {}) {
  let cachedClient, cachedConfig;
  const client = () => {
    const config = configuration();
    if (!config) return null;
    if (cachedConfig !== config) { cachedClient = storageClientFactory(config); cachedConfig = config; }
    return cachedClient;
  };
  return {
    async config(db) { return { enabled: !!client() && await db.photosReady() }; },
    async upload(db, roomCode, imageBase64, mimeType, idempotencyKey) {
      const storage = client();
      if (!storage || !await db.photosReady()) throw new HttpError(503, 'PHOTOS_UNAVAILABLE', 'Tải ảnh hiện chưa khả dụng.');
      const buffer = decodeImageBase64(imageBase64);
      await validateImage(buffer, mimeType, { decode });
      const hash = sha256Hex(buffer);
      if (idempotencyKey) {
        const existing = await db.findByIdempotencyKey(roomCode, idempotencyKey);
        if (existing) {
          if (existing.content_hash !== hash || existing.mime_type !== mimeType) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Khóa tải ảnh đã dùng cho nội dung khác.');
          if (existing.state === 'deleted' || existing.state === 'pending_delete' || existing.state === 'delete_failed') throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Ảnh đã bị xóa, không thể dùng lại khóa này.');
          const urls = await storage.createSignedUrls([existing.storage_path], SIGN_TTL_SECONDS);
          return { photo_url: urls.get(existing.storage_path) || null, storage_path: existing.storage_path };
        }
      }
      const path = newStoragePath(roomCode, mimeType);
      // Register the path before the remote call: a crash after this still leaves a
      // trackable staged row (swept by cleanup); the reverse order would leak an
      // untracked remote object no cleanup could ever find.
      await db.registerStaged(roomCode, path, hash, mimeType, buffer.length, idempotencyKey || null);
      await storage.upload(path, buffer, mimeType);
      const urls = await storage.createSignedUrls([path], SIGN_TTL_SECONDS);
      return { photo_url: urls.get(path) || null, storage_path: path };
    },
    async remove(db, roomCode, storagePath) {
      const released = await db.releaseStaged(roomCode, storagePath);
      if (!released) throw new HttpError(404, 'NOT_FOUND', 'Ảnh không tồn tại hoặc đã được gắn vào món.');
      return { success: true };
    },
    async signFoods(db, foods) {
      const storage = client();
      const paths = [...new Set(foods.filter(food => food.storage_path).map(food => food.storage_path))];
      const urls = storage && paths.length ? await storage.createSignedUrls(paths, SIGN_TTL_SECONDS) : new Map();
      return foods.map(food => food.storage_path ? { ...food, photo_url: urls.get(food.storage_path) || null } : food);
    },
    async cleanup(db, { budgetMs = 15000, maximum = 50 } = {}) {
      const storage = client();
      if (!storage) return { attempted: 0, deleted: 0 };
      const started = now();
      let attempted = 0, deleted = 0;
      while (attempted < maximum && now() - started < budgetMs - 100) {
        const claimed = await db.claimCleanup(Math.min(10, maximum - attempted), STAGED_GRACE_SECONDS);
        if (!claimed.length) break;
        attempted += claimed.length;
        await Promise.all(claimed.map(async row => {
          let success = false;
          try { success = await storage.remove([row.storage_path]); } catch { success = false; }
          await db.finishCleanup(row.storage_path, success);
          if (success) deleted++;
        }));
      }
      return { attempted, deleted };
    },
  };
}
export const photoService = createPhotoService();
