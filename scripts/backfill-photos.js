// C025 resumable, dry-run-first backfill for legacy durable base64 photo_url rows.
// Usage:
//   node scripts/backfill-photos.js            (dry run: reports what would migrate)
//   node scripts/backfill-photos.js --apply    (real run: uploads + sets storage_path)
//
// Never modifies or clears the legacy photo_url column, even on success: only storage_path
// is written. A row with storage_path already set is skipped, so re-running is safe and
// resumable after a partial run or a crash. Only foods created before storage_path existed
// (photo_url is a data: URI, storage_path is null) are candidates; anything already using
// storage_path, or with no photo at all, is left untouched.
import { Pool } from 'pg';
import sharp from 'sharp';
import { runMigrations } from '../server/migrate.js';
import { decodeImageBase64, detectSignature, MAX_BYTES, MAX_DIMENSION, sha256Hex, newStoragePath, photoConfig, createStorageClient } from '../server/photos.js';

const apply = process.argv.includes('--apply');

function decodeDataUri(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value || '');
  if (!match) return null;
  try { return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') }; } catch { return null; }
}

// Legacy rows predate the 100KB/1280px bound; recompress oversized ones the same way the
// client does today, rather than rejecting perfectly real historical photos outright.
async function fitBounds(buffer, mimeType) {
  let working = buffer;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (working.length <= MAX_BYTES) {
      const metadata = await sharp(working).metadata();
      if ((metadata.width || 0) <= MAX_DIMENSION && (metadata.height || 0) <= MAX_DIMENSION && (metadata.pages || 1) <= 1) return { buffer: working, mimeType: 'image/jpeg' };
    }
    working = await sharp(buffer, { pages: 1 }).resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: Math.max(30, 70 - attempt * 10) }).toBuffer();
    buffer = working;
  }
  return null;
}

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required; nothing was read.'); process.exit(1); }
const config = photoConfig();
if (apply && !config) { console.error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are required to --apply; nothing was uploaded.'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
try {
  await runMigrations(pool);
  const rows = (await pool.query("select id,room_code,photo_url from public.foods where storage_path is null and photo_url like 'data:image/%'")).rows;
  console.log(`${rows.length} legacy row(s) with an inline photo_url and no storage_path.`);
  const storage = apply ? createStorageClient(config) : null;
  let migrated = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const decoded = decodeDataUri(row.photo_url);
    if (!decoded || detectSignature(decoded.buffer) !== decoded.mimeType) { console.log(`  ${row.id}: SKIP (not a recognizable inline image)`); skipped++; continue; }
    const fitted = await fitBounds(decoded.buffer, decoded.mimeType);
    if (!fitted) { console.log(`  ${row.id}: FAIL (could not fit 100KB/1280px bound; original bytes untouched)`); failed++; continue; }
    if (!apply) { console.log(`  ${row.id}: would migrate (${decoded.buffer.length} -> ${fitted.buffer.length} bytes)`); continue; }
    try {
      decodeImageBase64(fitted.buffer.toString('base64')); // reuses the exact server-side bound check
      const path = newStoragePath(row.room_code, fitted.mimeType);
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`photos:${row.room_code}`]);
        await client.query(`insert into sharefridge_private.photo_uploads(storage_path,room_code,content_hash,mime_type,byte_length,state,food_id)
          values($1,$2,$3,$4,$5,'attached',$6)`, [path, row.room_code, sha256Hex(fitted.buffer), fitted.mimeType, fitted.buffer.length, row.id]);
        await storage.upload(path, fitted.buffer, fitted.mimeType);
        await client.query('update public.foods set storage_path=$1 where id=$2', [path, row.id]);
        await client.query('commit');
      } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
      finally { client.release(); }
      console.log(`  ${row.id}: migrated -> ${path}`);
      migrated++;
    } catch (error) {
      console.log(`  ${row.id}: FAIL (${error.message}); original photo_url untouched, retry later`);
      failed++;
    }
  }
  console.log(apply ? `Done: ${migrated} migrated, ${skipped} skipped, ${failed} failed.` : 'Dry run only; re-run with --apply to perform the migration.');
} catch (error) {
  console.error(`Backfill failed (${/^[A-Z0-9_]{2,12}$/.test(error.code || '') ? error.code : 'DATABASE_ERROR'}).`);
  process.exitCode = 1;
} finally { await pool.end(); }
