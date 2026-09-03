import { HttpError } from './http.js';

const roomLock = client => code => client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`photos:${code}`]);

export function createPhotoRepository(pool) {
  const query = (sql, values) => pool.query(sql, values);
  return {
    async photosReady() {
      try {
        const ready = (await query("select exists(select 1 from sharefridge_private.schema_migrations where version='004_photo_storage') as ready")).rows[0].ready;
        await query('select storage_path,state,food_id from sharefridge_private.photo_uploads limit 0');
        return ready;
      } catch { return false; }
    },
    // Registers a newly-uploaded object as staged, before it is ever attached to a food.
    // Runs in its own short transaction, separate from any food-row transaction.
    async registerStaged(roomCode, storagePath, contentHash, mimeType, byteLength, idempotencyKey) {
      await roomLock({ query })(roomCode);
      await query(`insert into sharefridge_private.photo_uploads(storage_path,room_code,content_hash,mime_type,byte_length,idempotency_key)
        values($1,$2,$3,$4,$5,$6)`, [storagePath, roomCode, contentHash, mimeType, byteLength, idempotencyKey || null]);
    },
    async findByIdempotencyKey(roomCode, idempotencyKey) {
      if (!idempotencyKey) return null;
      return (await query('select * from sharefridge_private.photo_uploads where room_code=$1 and idempotency_key=$2', [roomCode, idempotencyKey])).rows[0] || null;
    },
    // Marks a staged, room-owned, currently-unreferenced upload for deletion. Used by the
    // explicit DELETE /api/photos (the client attached nothing, or cancelled before saving).
    async releaseStaged(roomCode, storagePath) {
      const result = await query(`update sharefridge_private.photo_uploads set state='pending_delete',updated_at=clock_timestamp()
        where storage_path=$1 and room_code=$2 and state='staged' and food_id is null returning storage_path`, [storagePath, roomCode]);
      return result.rowCount > 0;
    },
    // Must run inside the caller's existing food-row transaction/client. Re-claiming a
    // path already attached to the same food (saving the same photo again, unchanged)
    // is a no-op success, not a failure — only a foreign or differently-attached path is rejected.
    async claimAttachment(client, roomCode, storagePath, foodId) {
      await roomLock(client)(roomCode);
      const row = (await client.query("select state,food_id from sharefridge_private.photo_uploads where storage_path=$1 and room_code=$2 for update", [storagePath, roomCode])).rows[0];
      if (!row || (row.state !== 'staged' && !(row.state === 'attached' && row.food_id === foodId))) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Ảnh tải lên không còn tồn tại hoặc đã được dùng cho món khác.');
      await client.query("update sharefridge_private.photo_uploads set state='attached',food_id=$3,updated_at=clock_timestamp() where storage_path=$1 and room_code=$2", [storagePath, roomCode, foodId]);
    },
    // Detaches whatever is currently attached to this food (except keepStoragePath, when the
    // caller is re-saving the same photo) and marks it for cleanup. Must run inside the
    // caller's existing food-row transaction/client; safe to call even if nothing is attached.
    async releaseForFood(client, roomCode, foodId, keepStoragePath = null) {
      await roomLock(client)(roomCode);
      await client.query(`update sharefridge_private.photo_uploads set state='pending_delete',food_id=null,updated_at=clock_timestamp()
        where food_id=$1 and room_code=$2 and state='attached' and storage_path is distinct from $3`, [foodId, roomCode, keepStoragePath]);
    },
    // Claims a bounded batch of storage objects that need a real Storage-API delete: newly
    // orphaned staged uploads (never attached, past the grace period) and anything already
    // marked pending_delete/delete_failed under its retry backoff.
    async claimCleanup(limit, staleSeconds) {
      const result = await query(`update sharefridge_private.photo_uploads set state='pending_delete',updated_at=clock_timestamp()
        where state='staged' and created_at<=clock_timestamp()-make_interval(secs=>$1)`, [staleSeconds]);
      return (await query(`select storage_path,room_code,attempts from sharefridge_private.photo_uploads
        where state in ('pending_delete','delete_failed') and next_attempt_at<=clock_timestamp() and attempts<5
        order by next_attempt_at limit $1 for update skip locked`, [limit])).rows;
    },
    async finishCleanup(storagePath, deleted) {
      if (deleted) { await query("update sharefridge_private.photo_uploads set state='deleted',updated_at=clock_timestamp() where storage_path=$1", [storagePath]); return; }
      await query(`update sharefridge_private.photo_uploads set state='delete_failed',attempts=attempts+1,
        next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*2^attempts)),updated_at=clock_timestamp() where storage_path=$1`, [storagePath]);
    },
  };
}

// Explicit test adapter only; runtime never substitutes this for PostgreSQL.
export function createMemoryPhotoRepository(uploads) {
  return {
    async photosReady() { return true; },
    async registerStaged(roomCode, storagePath, contentHash, mimeType, byteLength, idempotencyKey) {
      uploads.set(storagePath, { storage_path: storagePath, room_code: roomCode, content_hash: contentHash, mime_type: mimeType, byte_length: byteLength, idempotency_key: idempotencyKey || null, state: 'staged', food_id: null });
    },
    async findByIdempotencyKey(roomCode, idempotencyKey) {
      if (!idempotencyKey) return null;
      for (const row of uploads.values()) if (row.room_code === roomCode && row.idempotency_key === idempotencyKey) return structuredClone(row);
      return null;
    },
    async releaseStaged(roomCode, storagePath) {
      const row = uploads.get(storagePath);
      if (!row || row.room_code !== roomCode || row.state !== 'staged' || row.food_id) return false;
      row.state = 'pending_delete';
      return true;
    },
    async claimAttachment(_client, roomCode, storagePath, foodId) {
      const row = uploads.get(storagePath);
      if (!row || row.room_code !== roomCode || (row.state !== 'staged' && !(row.state === 'attached' && row.food_id === foodId))) throw new HttpError(404, 'PHOTO_NOT_FOUND', 'Ảnh tải lên không còn tồn tại hoặc đã được dùng cho món khác.');
      row.state = 'attached'; row.food_id = foodId;
    },
    async releaseForFood(_client, roomCode, foodId, keepStoragePath = null) {
      for (const row of uploads.values()) if (row.room_code === roomCode && row.food_id === foodId && row.state === 'attached' && row.storage_path !== keepStoragePath) { row.state = 'pending_delete'; row.food_id = null; }
    },
    async claimCleanup() { return []; },
    async finishCleanup() {},
  };
}
