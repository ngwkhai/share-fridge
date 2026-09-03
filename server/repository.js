import crypto from 'node:crypto';
import { Pool } from 'pg';
import { HttpError } from './http.js';
import { createPushRepository, createMemoryPushRepository } from './pushRepository.js';
import { createPhotoRepository, createMemoryPhotoRepository } from './photosRepository.js';

const REQUIRED_MIGRATION = '001_durable_repository';
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function iso(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeRoom(row) {
  return row ? { ...row, id: String(row.id), created_at: iso(row.created_at) } : null;
}

function normalizeFood(row) {
  return row ? {
    ...row,
    id: String(row.id),
    added_date: iso(row.added_date),
    expiry_date: iso(row.expiry_date),
    consumed_at: row.consumed_at ? iso(row.consumed_at) : null,
    days_remaining: Math.ceil((new Date(row.expiry_date).getTime() - Date.now()) / 86400000),
  } : null;
}

function normalizeShopping(row) {
  return row ? { ...row, id: String(row.id), created_at: iso(row.created_at) } : null;
}

function shoppingMovedFood(item, compartment, actor) {
  const added = new Date();
  const expiry = new Date(added.getTime() + 3 * 86400000);
  return {
    id: crypto.randomUUID(), room_code: item.room_code, name: item.name,
    quantity: item.quantity, compartment, container_tag: '',
    added_date: added.toISOString(), expiry_date: expiry.toISOString(),
    days_remaining: 3, status: 'FRESH', photo_url: null, storage_path: null,
    notes: null, created_by: actor, consumed_by: null, consumed_at: null,
  };
}

function productionGuard() {
  if (process.env.NODE_ENV === 'production') {
    throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is not configured.');
  }
}

function batchHash(ids, addToShopping) {
  return crypto.createHash('sha256').update(JSON.stringify({ food_ids: [...ids].sort(), add_to_shopping_list: addToShopping })).digest('hex');
}
function assertCookable(rows, expected, now) {
  if (rows.length !== expected) throw new HttpError(404, 'FOOD_NOT_FOUND', 'Một nguyên liệu không còn trong tủ. Hãy lấy gợi ý mới.');
  if (rows.some(row => row.status === 'CONSUMED' || !Number.isFinite(Date.parse(row.expiry_date)) || Date.parse(row.expiry_date) <= now)) {
    throw new HttpError(409, 'FOOD_UNAVAILABLE', 'Một nguyên liệu đã dùng hoặc hết hạn. Chưa có món đồ nào được cập nhật; hãy lấy gợi ý mới.');
  }
}
function replayBatch(prior, hash) {
  if (prior.request_hash !== hash) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'Lần nấu này đã được dùng cho danh sách nguyên liệu khác.');
  return structuredClone(prior.response);
}

export function createMemoryRepository(seed = {}) {
  productionGuard();
  const rooms = new Map((seed.rooms || []).map(item => [item.code, structuredClone(item)]));
  const foods = new Map((seed.foods || []).map(item => [item.id, structuredClone(item)]));
  const shoppingItems = new Map((seed.shoppingItems || []).map(item => [item.id, structuredClone(item)]));
  const subscribers = new Map((seed.subscribers || []).map(item => [item.id, structuredClone(item)]));
  const uploads = new Map((seed.uploads || []).map(item => [item.storage_path, structuredClone(item)]));
  const photoRepo = createMemoryPhotoRepository(uploads);
  const limits = new Map();
  const movedShopping = new Set();
  const batches = new Map();
  let serial = Promise.resolve();
  const locked = operation => {
    const next = serial.then(operation, operation);
    serial = next.catch(() => {});
    return next;
  };
  const assertTest = () => productionGuard();
  return {
    kind: 'test', rooms, foods, shoppingItems, subscribers,
    async ready() { assertTest(); return true; },
    async close() {},
    async getRoom(code) { assertTest(); return structuredClone(rooms.get(code) || null); },
    async createRoom(room) {
      assertTest();
      return locked(() => {
        if (rooms.has(room.code)) return null;
        const saved = { ...room, id: room.id || crypto.randomUUID() };
        rooms.set(saved.code, structuredClone(saved));
        return structuredClone(saved);
      });
    },
    async authenticateRoom(code, passcode, keys, verify, maximum = 5) {
      assertTest();
      return locked(() => {
        const now = Date.now();
        for (const key of keys) {
          const row = limits.get(key);
          if (row && row.expiresAt > now && row.count >= maximum) return { rateLimited: true, room: null };
        }
        const room = rooms.get(code);
        if (!room || !verify(passcode, room.passcode_hash, room.salt)) {
          for (const key of keys) {
            const row = limits.get(key);
            limits.set(key, !row || row.expiresAt <= now ? { count: 1, expiresAt: now + 900000 } : { ...row, count: row.count + 1 });
          }
          return { rateLimited: false, room: null };
        }
        return { rateLimited: false, room: structuredClone(room) };
      });
    },
    async chargeRateLimit(key, maximum = 30) {
      assertTest();
      return locked(() => {
        const now = Date.now();
        const row = limits.get(key);
        if (row && row.expiresAt > now && row.count >= maximum) return false;
        limits.set(key, !row || row.expiresAt <= now ? { count: 1, expiresAt: now + 900000 } : { ...row, count: row.count + 1 });
        return true;
      });
    },
    async clearRateLimit(key) { assertTest(); limits.delete(key); },
    async roomStats(code) {
      assertTest();
      const active = [...foods.values()].filter(item => item.room_code === code && item.status !== 'CONSUMED');
      return { active_food_count: active.length, urgent_food_count: active.filter(item => new Date(item.expiry_date).getTime() <= Date.now() + 2 * 86400000).length };
    },
    async listFoods(code) { assertTest(); return [...foods.values()].filter(item => item.room_code === code).map(item => structuredClone(item)); },
    async createFood(food) {
      assertTest();
      if (food.storage_path) await photoRepo.claimAttachment(null, food.room_code, food.storage_path, food.id);
      foods.set(food.id, structuredClone(food)); return structuredClone(food);
    },
    async getFood(id, code) { assertTest(); const item = foods.get(id); return item?.room_code === code ? structuredClone(item) : null; },
    async updateFood(id, code, changes) {
      assertTest();
      const item = foods.get(id); if (!item || item.room_code !== code) return null;
      if ('storage_path' in changes) {
        await photoRepo.releaseForFood(null, code, id, changes.storage_path || null);
        if (changes.storage_path) await photoRepo.claimAttachment(null, code, changes.storage_path, id);
      }
      Object.assign(item, structuredClone(changes)); return structuredClone(item);
    },
    async consumeFood(id, code, actor, addToShopping) {
      assertTest();
      return locked(() => {
        const item = foods.get(id);
        if (!item || item.room_code !== code) return null;
        if (item.status !== 'CONSUMED') {
          item.status = 'CONSUMED'; item.consumed_by = actor; item.consumed_at = new Date().toISOString();
          if (addToShopping) {
            const shop = { id: crypto.randomUUID(), room_code: code, name: item.name, quantity: item.quantity, is_bought: false, created_at: new Date().toISOString() };
            shoppingItems.set(shop.id, shop);
          }
        }
        return structuredClone(item);
      });
    },
    async consumeBatch(ids, code, actor, addToShopping, key) {
      assertTest();
      return locked(() => {
        const operationKey = `${code}:consume-batch:${key}`, hash = batchHash(ids, addToShopping);
        if (batches.has(operationKey)) return replayBatch(batches.get(operationKey), hash);
        const rows = [...ids].sort().map(id => foods.get(id)).filter(row => row?.room_code === code);
        const now = Date.now();
        assertCookable(rows, ids.length, now);
        const consumedAt = new Date(now).toISOString();
        for (const row of rows) {
          row.status = 'CONSUMED'; row.consumed_by = actor; row.consumed_at = consumedAt;
          if (addToShopping) {
            const item = { id: crypto.randomUUID(), room_code: code, name: row.name, quantity: row.quantity, is_bought: false, created_at: consumedAt };
            shoppingItems.set(item.id, item);
          }
        }
        const response = { items: structuredClone(rows), consumed_at: consumedAt };
        batches.set(operationKey, { request_hash: hash, response });
        return structuredClone(response);
      });
    },
    async deleteFood(id, code) {
      assertTest();
      const item = foods.get(id); if (!item || item.room_code !== code) return false;
      if (item.storage_path) await photoRepo.releaseForFood(null, code, id, null);
      return foods.delete(id);
    },
    async listShopping(code) { assertTest(); return [...shoppingItems.values()].filter(item => item.room_code === code).map(item => structuredClone(item)); },
    async createShopping(item) { assertTest(); shoppingItems.set(item.id, structuredClone(item)); return structuredClone(item); },
    async getShopping(id, code) { assertTest(); const item = shoppingItems.get(id); return item?.room_code === code ? structuredClone(item) : null; },
    async toggleShopping(id, code, bought, moveToFridge, compartment, actor) {
      assertTest();
      return locked(() => {
        const item = shoppingItems.get(id); if (!item || item.room_code !== code) return null;
        item.is_bought = bought;
        const moveKey = `${code}:shopping-move:${id}`;
        if (bought && moveToFridge && !movedShopping.has(moveKey)) {
          const food = shoppingMovedFood(item, compartment, actor);
          foods.set(food.id, food); movedShopping.add(moveKey);
        }
        return structuredClone(item);
      });
    },
    async deleteShopping(id, code) { assertTest(); const item = shoppingItems.get(id); return Boolean(item?.room_code === code && shoppingItems.delete(id)); },
    async saveSubscription(code, subscription, deviceName) {
      assertTest();
      return locked(() => {
        const existing = [...subscribers.values()].find(item => item.room_code === code && item.subscription.endpoint === subscription.endpoint);
        const saved = { id: existing?.id || crypto.randomUUID(), room_code: code, subscription: structuredClone(subscription), device_name: deviceName || null, created_at: existing?.created_at || new Date().toISOString() };
        subscribers.set(saved.id, saved); return structuredClone(saved);
      });
    },
    async listSubscriptions(code) { assertTest(); return [...subscribers.values()].filter(item => item.room_code === code).map(item => structuredClone(item)); },
    ...createMemoryPushRepository(subscribers),
    ...photoRepo,
  };
}

async function transaction(pool, operation, pushActor = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("select set_config('sharefridge.push_actor',$1,true)", [pushActor || '']);
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresRepository({ connectionString = process.env.DATABASE_URL, pool: suppliedPool } = {}) {
  if (!suppliedPool && !connectionString) throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is not configured.');
  const pool = suppliedPool || new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, idleTimeoutMillis: 10000, allowExitOnIdle: true });
  const ownsPool = !suppliedPool;
  const photoRepo = createPhotoRepository(pool);
  // pg emits idle connection errors outside a request. Evicting them is pg's job;
  // the listener prevents a process crash and never logs connection credentials.
  if (ownsPool) pool.on('error', () => {});
  const query = (text, values) => pool.query(text, values);
  return {
    kind: 'postgres', pool,
    async realtimeReady() {
      try {
        const result = await query(`select exists(select 1 from sharefridge_private.schema_migrations where version='002_room_sync') and exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) and exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='room_sync_versions') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('foods','shopping_items')) as ready`);
        await query('select room_code,revision,changed_at from public.room_sync_versions limit 0');
        return result.rows[0]?.ready === true;
      } catch { return false; }
    },
    async ready() {
      try {
        const result = await query(`select exists(select 1 from sharefridge_private.schema_migrations where version=$1) as migrated,
          to_regclass('public.rooms') is not null and to_regclass('public.foods') is not null and
          to_regclass('public.shopping_items') is not null and to_regclass('public.push_subscriptions') is not null as tables`, [REQUIRED_MIGRATION]);
        if (result.rows[0]?.migrated !== true || result.rows[0]?.tables !== true) return false;
        await query(`select r.id,r.code,r.name,r.passcode_hash,r.salt,r.created_at,
          f.id,f.room_code,f.name,f.quantity,f.compartment,f.container_tag,f.added_date,f.expiry_date,f.status,f.photo_url,f.storage_path,f.notes,f.created_by,f.consumed_by,f.consumed_at,
          s.id,s.room_code,s.name,s.quantity,s.is_bought,s.created_at,
          p.id,p.room_code,p.subscription,p.device_name,p.created_at,
          l.bucket,l.count,l.expires_at,i.room_code,i.operation,i.key,i.request_hash,i.response,i.created_at
          from public.rooms r,public.foods f,public.shopping_items s,public.push_subscriptions p,
          sharefridge_private.rate_limits l,sharefridge_private.idempotency_keys i limit 0`);
        return true;
      } catch { return false; }
    },
    async close() { if (ownsPool) await pool.end(); },
    async getRoom(code) { return normalizeRoom((await query('select * from public.rooms where code=$1', [code])).rows[0]); },
    async createRoom(room) {
      const result = await query(`insert into public.rooms(id,code,name,passcode_hash,salt,created_at) values($1,$2,$3,$4,$5,$6)
        on conflict(code) do nothing returning *`, [room.id, room.code, room.name, room.passcode_hash, room.salt, room.created_at]);
      return normalizeRoom(result.rows[0]);
    },
    async authenticateRoom(code, passcode, keys, verify, maximum = 5) {
      return transaction(pool, async client => {
        const { now, expires } = (await client.query("select clock_timestamp() as now, clock_timestamp() + interval '15 minutes' as expires")).rows[0];
        const normalized = [...new Set(keys)].sort();
        for (const key of normalized) await client.query(`insert into sharefridge_private.rate_limits(bucket,count,expires_at) values($1,0,$2) on conflict(bucket) do nothing`, [key, expires]);
        const limited = await client.query(`select bucket,count,expires_at from sharefridge_private.rate_limits where bucket=any($1::text[]) order by bucket for update`, [normalized]);
        for (const row of limited.rows) {
          if (row.expires_at <= now) await client.query('update sharefridge_private.rate_limits set count=0,expires_at=$2 where bucket=$1', [row.bucket, expires]);
          else if (row.count >= maximum) return { rateLimited: true, room: null };
        }
        const room = (await client.query('select * from public.rooms where code=$1', [code])).rows[0];
        if (!room || !verify(passcode, room.passcode_hash, room.salt)) {
          await client.query('update sharefridge_private.rate_limits set count=count+1 where bucket=any($1::text[])', [normalized]);
          return { rateLimited: false, room: null };
        }
        return { rateLimited: false, room: normalizeRoom(room) };
      });
    },
    async chargeRateLimit(key, maximum = 30) {
      return transaction(pool, async client => {
        const { now, expires } = (await client.query("select clock_timestamp() as now, clock_timestamp() + interval '15 minutes' as expires")).rows[0];
        await client.query('insert into sharefridge_private.rate_limits(bucket,count,expires_at) values($1,0,$2) on conflict(bucket) do nothing', [key, expires]);
        const row = (await client.query('select count,expires_at from sharefridge_private.rate_limits where bucket=$1 for update', [key])).rows[0];
        if (row.expires_at <= now) await client.query('update sharefridge_private.rate_limits set count=0,expires_at=$2 where bucket=$1', [key, expires]);
        else if (row.count >= maximum) return false;
        await client.query('update sharefridge_private.rate_limits set count=count+1 where bucket=$1', [key]);
        return true;
      });
    },
    async clearRateLimit(key) { await query('delete from sharefridge_private.rate_limits where bucket=$1', [key]); },
    async roomStats(code) {
      const row = (await query(`select count(*) filter(where status <> 'CONSUMED')::int as active_food_count,
        count(*) filter(where status <> 'CONSUMED' and expiry_date <= now() + interval '2 days')::int as urgent_food_count from public.foods where room_code=$1`, [code])).rows[0];
      return row;
    },
    async listFoods(code) { return (await query('select * from public.foods where room_code=$1 order by added_date,id', [code])).rows.map(normalizeFood); },
    async createFood(food, pushActor = null) {
      return transaction(pool, async client => {
      if (food.storage_path) await photoRepo.claimAttachment(client, food.room_code, food.storage_path, food.id);
      const row = (await client.query(`insert into public.foods(id,room_code,name,quantity,compartment,container_tag,added_date,expiry_date,status,photo_url,storage_path,notes,created_by,consumed_by,consumed_at)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [food.id,food.room_code,food.name,food.quantity,food.compartment,food.container_tag,food.added_date,food.expiry_date,food.status,food.photo_url,food.storage_path||null,food.notes,food.created_by,food.consumed_by||null,food.consumed_at||null])).rows[0];
      return normalizeFood(row);
      }, pushActor);
    },
    async getFood(id, code) { if (!isUuid(id)) return null; return normalizeFood((await query('select * from public.foods where id=$1 and room_code=$2', [id,code])).rows[0]); },
    async updateFood(id, code, changes, pushActor = null) {
      if (!isUuid(id)) return null;
      const allowed = ['name','quantity','compartment','container_tag','expiry_date','notes','photo_url','storage_path'];
      const fields = Object.keys(changes).filter(field => allowed.includes(field));
      if (!fields.length) return this.getFood(id, code);
      const assignments = fields.map((field,index) => `${field}=$${index+3}`).join(',');
      return transaction(pool, async client => {
      const row = (await client.query(`update public.foods set ${assignments} where id=$1 and room_code=$2 returning *`, [id,code,...fields.map(field => changes[field])])).rows[0];
      if (row && 'storage_path' in changes) {
        await photoRepo.releaseForFood(client, code, id, changes.storage_path || null);
        if (changes.storage_path) await photoRepo.claimAttachment(client, code, changes.storage_path, id);
      }
      return normalizeFood(row);
      }, pushActor);
    },
    async consumeFood(id, code, actor, addToShopping, pushActor = null) {
      if (!isUuid(id)) return null;
      return transaction(pool, async client => {
        const row = (await client.query('select * from public.foods where id=$1 and room_code=$2 for update', [id,code])).rows[0];
        if (!row) return null;
        if (row.status !== 'CONSUMED') {
          const consumed = (await client.query(`update public.foods set status='CONSUMED',consumed_by=$3,consumed_at=now() where id=$1 and room_code=$2 returning *`, [id,code,actor])).rows[0];
          if (addToShopping) await client.query(`insert into public.shopping_items(id,room_code,name,quantity,is_bought,created_at) values($1,$2,$3,$4,false,now())`, [crypto.randomUUID(),code,row.name,row.quantity]);
          return normalizeFood(consumed);
        }
        return normalizeFood(row);
      }, pushActor);
    },
    async consumeBatch(ids, code, actor, addToShopping, key, pushActor = null) {
      const sorted = [...ids].sort(), hash = batchHash(ids, addToShopping);
      return transaction(pool, async client => {
        await client.query("set local lock_timeout='2s'; set local statement_timeout='5s'");
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([code, 'consume-batch', key])]);
        const prior = (await client.query("select request_hash,response from sharefridge_private.idempotency_keys where room_code=$1 and operation='consume-batch' and key=$2", [code, key])).rows[0];
        if (prior) return replayBatch(prior, hash);
        if (sorted.some(id => !isUuid(id))) throw new HttpError(404, 'FOOD_NOT_FOUND', 'Một nguyên liệu không còn trong tủ. Hãy lấy gợi ý mới.');
        // Lock the entire set in a deterministic order before the first write.
        // Food/shopping writes also lock the room revision through its trigger.
        const rows = (await client.query('select * from public.foods where room_code=$1 and id=any($2::uuid[]) order by id for update', [code, sorted])).rows;
        const now = (await client.query('select clock_timestamp() as now')).rows[0].now;
        assertCookable(rows, ids.length, now.getTime());
        const result = await client.query("update public.foods set status='CONSUMED',consumed_by=$3,consumed_at=$4 where room_code=$1 and id=any($2::uuid[]) returning *", [code, sorted, actor, now]);
        if (addToShopping) for (const row of rows) {
          await client.query('insert into public.shopping_items(id,room_code,name,quantity,is_bought,created_at) values($1,$2,$3,$4,false,$5)', [crypto.randomUUID(), code, row.name, row.quantity, now]);
        }
        const response = { items: result.rows.map(normalizeFood).sort((a, b) => a.id.localeCompare(b.id)), consumed_at: now.toISOString() };
        await client.query("insert into sharefridge_private.idempotency_keys(room_code,operation,key,request_hash,response) values($1,'consume-batch',$2,$3,$4)", [code, key, hash, JSON.stringify(response)]);
        return response;
      }, pushActor).catch(error => {
        if (['55P03','57014','40P01'].includes(error.code)) throw new HttpError(503, 'BATCH_BUSY', 'Tủ đang có thay đổi khác. Chưa lưu lần nấu này; hãy thử lại.');
        throw error;
      });
    },
    async deleteFood(id, code, pushActor = null) {
      if (!isUuid(id)) return false;
      return transaction(pool, async client => {
        const deleted = (await client.query('delete from public.foods where id=$1 and room_code=$2 returning storage_path', [id,code])).rows[0];
        if (!deleted) return false;
        if (deleted.storage_path) await photoRepo.releaseForFood(client, code, id, null);
        return true;
      }, pushActor);
    },
    async listShopping(code) { return (await query('select * from public.shopping_items where room_code=$1 order by created_at,id', [code])).rows.map(normalizeShopping); },
    async createShopping(item, pushActor = null) { return transaction(pool, async client => normalizeShopping((await client.query(`insert into public.shopping_items(id,room_code,name,quantity,is_bought,created_at) values($1,$2,$3,$4,$5,$6) returning *`, [item.id,item.room_code,item.name,item.quantity,item.is_bought,item.created_at])).rows[0]), pushActor); },
    async getShopping(id, code) { if (!isUuid(id)) return null; return normalizeShopping((await query('select * from public.shopping_items where id=$1 and room_code=$2', [id,code])).rows[0]); },
    async toggleShopping(id, code, bought, moveToFridge, compartment, actor, pushActor = null) {
      if (!isUuid(id)) return null;
      return transaction(pool, async client => {
        const item = (await client.query('select * from public.shopping_items where id=$1 and room_code=$2 for update', [id,code])).rows[0];
        if (!item) return null;
        const saved = (await client.query('update public.shopping_items set is_bought=$3 where id=$1 and room_code=$2 returning *', [id,code,bought])).rows[0];
        if (bought && moveToFridge) {
          const operation = 'shopping-move', key = id;
          const prior = (await client.query('select 1 from sharefridge_private.idempotency_keys where room_code=$1 and operation=$2 and key=$3', [code,operation,key])).rows[0];
          if (!prior) {
            const food = shoppingMovedFood(item, compartment, actor);
            await client.query(`insert into public.foods(id,room_code,name,quantity,compartment,container_tag,added_date,expiry_date,status,photo_url,storage_path,notes,created_by,consumed_by,consumed_at)
              values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [food.id,food.room_code,food.name,food.quantity,food.compartment,food.container_tag,food.added_date,food.expiry_date,food.status,food.photo_url,food.storage_path,food.notes,food.created_by,food.consumed_by,food.consumed_at]);
            await client.query(`insert into sharefridge_private.idempotency_keys(room_code,operation,key,request_hash,response) values($1,$2,$3,$4,$5)`, [code,operation,key,crypto.createHash('sha256').update(`${id}:move`).digest('hex'),JSON.stringify({ food_id: food.id })]);
          }
        }
        return normalizeShopping(saved);
      }, pushActor);
    },
    async deleteShopping(id, code, pushActor = null) { if (!isUuid(id)) return false; return transaction(pool, async client => (await client.query('delete from public.shopping_items where id=$1 and room_code=$2', [id,code])).rowCount > 0, pushActor); },
    async saveSubscription(code, subscription, deviceName) {
      return transaction(pool, async client => {
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`${code}:${subscription.endpoint}`]);
        const existing = (await client.query(`select * from public.push_subscriptions where room_code=$1 and subscription->>'endpoint'=$2 order by created_at,id limit 1`, [code,subscription.endpoint])).rows[0];
        const result = existing
          ? await client.query('update public.push_subscriptions set subscription=$3,device_name=$4 where id=$1 and room_code=$2 returning *', [existing.id,code,subscription,deviceName||null])
          : await client.query('insert into public.push_subscriptions(id,room_code,subscription,device_name,created_at) values($1,$2,$3,$4,now()) returning *', [crypto.randomUUID(),code,subscription,deviceName||null]);
        return { ...result.rows[0], id: String(result.rows[0].id), created_at: iso(result.rows[0].created_at) };
      });
    },
    async listSubscriptions(code) { return (await query('select * from public.push_subscriptions where room_code=$1 order by created_at,id', [code])).rows.map(row => ({ ...row, id: String(row.id), created_at: iso(row.created_at) })); },
    ...createPushRepository(pool),
    ...photoRepo,
  };
}

export function createConfiguredRepository() {
  return createPostgresRepository({ connectionString: process.env.DATABASE_URL });
}

export { REQUIRED_MIGRATION };
