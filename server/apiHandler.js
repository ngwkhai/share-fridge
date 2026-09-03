import fs from 'fs';
import { foodDto, subscriptionDto, text, boolean, compartment, fields, invalid } from './validation.js';
import crypto from 'node:crypto';
import { HttpError, readJsonBody, sendError } from './http.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPasscode, verifyPasscode, generateSessionToken, verifySessionToken } from './security.js';
import { createConfiguredRepository } from './repository.js';
import { realtimeAvailable, issueRealtimeToken } from './realtime.js';
import { suggestRecipesWithGemini, parseVoiceWithGemini } from './geminiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiSpec = JSON.parse(fs.readFileSync(path.join(__dirname, 'openapi.json'), 'utf-8'));

function calculateStatusAndDays(expiryDateStr) {
  const now = new Date();
  const expiry = new Date(expiryDateStr);
  const diffTime = expiry.getTime() - now.getTime();
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  let status = 'FRESH';
  if (days <= 0) status = 'EXPIRED';
  else if (days <= 2) status = 'COOK_SOON';
  return { days_remaining: days, status };
}


function publicFood(food) {
  const computed = calculateStatusAndDays(food.expiry_date);
  const result = { ...food, ...computed, status: food.status === 'CONSUMED' ? 'CONSUMED' : computed.status };
  for (const field of ['quantity','container_tag','created_by']) if (result[field] === null) delete result[field];
  return result;
}
function publicShopping(item) {
  const result = { ...item };
  if (result.quantity === null) delete result.quantity;
  return result;
}

function publicRoom(room) {
  return { id: room.id, code: room.code, name: room.name, created_at: room.created_at };
}

function roomCode(value) {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value)) throw new HttpError(400, 'INVALID_ROOM_CODE', 'Room code must contain six digits.');
  return value;
}

function boundedText(value, fallback, label) {
  const text = value === undefined ? fallback : value;
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 100) throw new HttpError(400, 'INVALID_INPUT', `${label} must contain 1 to 100 characters.`);
  return text.trim();
}

function validatePasscode(value) {
  if (typeof value !== 'string' || !/^\d{4,6}$/.test(value)) throw new HttpError(400, 'INVALID_PASSCODE', 'Passcode must contain four to six digits.');
  return value;
}

function assertRoomAccess(code, session) {
  roomCode(code);
  if (code !== session.room_code) throw new HttpError(403, 'FORBIDDEN', 'Room access denied.');
  return code;
}

function requireItem(item) {
  if (!item) throw new HttpError(404, 'NOT_FOUND', 'Item not found.');
  return item;
}

function limiterKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

let defaultRepository;
export function createApiHandler(repository) {
  return async (req, res) => {
    try {
      return await dispatchApiRequest(req, res, repository);
    } catch (error) {
      if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '57P03', '42P01', '42703'].includes(error.code)) {
        sendError(res, new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is unavailable.'));
      } else sendError(res, error);
      return true;
    }
  };
}
export const handleApiRequest = createApiHandler();

async function dispatchApiRequest(req, res, repository) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;
  if (pathname === '/readyz' && method === 'GET') {
    let ready = false, kind = 'unavailable';
    try {
      const candidate = repository || (defaultRepository ??= createConfiguredRepository());
      ready = await candidate.ready();
      if (ready) kind = candidate.kind;
    } catch { /* Readiness deliberately excludes connection/configuration details. */ }
    res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: ready ? 'ok' : 'unavailable', database: kind }));
    return true;
  }
  if (pathname === '/api/config' && method === 'GET') {
    let realtime = false;
    try { realtime = await realtimeAvailable(repository || (defaultRepository ??= createConfiguredRepository())); } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ google_client_id: null, capabilities: { google: false, push: false, photos: false, realtime } }));
    return true;
  }
  if ((pathname === '/api/auth/google' && method === 'POST') || (pathname === '/api/cron/expiry' && method === 'GET')) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'This integration is not available yet.');
  const needsDatabase = pathname !== '/healthz' && pathname !== '/api/openapi.json' && pathname.startsWith('/api/');
  let db = repository;
  const resolveDb = () => db ??= defaultRepository ??= createConfiguredRepository();
  let session, sessionRoom;
  // A single gate covers every current and future route in a room namespace.
  const protectedPath = /^\/api\/(?:rooms\/|foods(?:\/|$)|shopping-items(?:\/|$)|ai(?:\/|$)|notifications(?:\/|$)|photos(?:\/|$)|realtime-token(?:\/|$))/.test(pathname);
  if (protectedPath) {
    const auth = req.headers.authorization;
    const match = typeof auth === 'string' && auth.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
    session = match ? verifySessionToken(match[1]) : null;
    if (!session || !(sessionRoom = await resolveDb().getRoom(session.room_code))) throw new HttpError(401, 'UNAUTHORIZED', 'A valid room session is required.');
    for (const code of url.searchParams.getAll('room_code')) assertRoomAccess(code, session);
  }
  if (needsDatabase) db = resolveDb();
  let bodyPromise;
  const parseJsonBody = () => {
    bodyPromise ??= readJsonBody(req).then(data => {
      if (session && data.room_code !== undefined) assertRoomAccess(data.room_code, session);
      return data;
    });
    return bodyPromise;
  };

  if (pathname === '/api/realtime-token' && method === 'GET') {
    if (!(await realtimeAvailable(db))) throw new HttpError(503, 'REALTIME_UNAVAILABLE', 'Room synchronization is not configured.');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(issueRealtimeToken(sessionRoom, session)));
    return true;
  }

  // 1. Healthz
  if (pathname === '/healthz' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() }));
    return true;
  }

  // 2. OpenAPI Spec
  if (pathname === '/api/openapi.json' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(openApiSpec));
    return true;
  }

  // Both create routes use the same validation and duplicate protection.
  if ((pathname === '/api/auth/create-room' || pathname === '/api/rooms') && method === 'POST') {
    const ip = process.env.VERCEL === '1' ? String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
    const key = limiterKey(`create:${ip}`);
    if (!(await db.chargeRateLimit(key, 30))) throw new HttpError(429, 'RATE_LIMITED', 'Too many room creation attempts.');
    const data = await parseJsonBody();
    const passcode = validatePasscode(data.passcode);
    const nickname = boundedText(data.nickname, 'Bạn cùng phòng', 'Nickname');
    let code;
    if (data.code !== undefined) {
      code = roomCode(data.code);
      if ((await db.getRoom(code))) throw new HttpError(409, 'ROOM_EXISTS', 'Room code already exists.');
    } else {
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = crypto.randomInt(100000, 1000000).toString();
        if (!(await db.getRoom(candidate))) { code = candidate; break; }
      }
      if (!code) throw new HttpError(503, 'ROOM_CODE_UNAVAILABLE', 'Could not allocate a room code.');
    }
    const name = boundedText(data.name, `Phòng ${code.slice(0, 3)}`, 'Room name');
    // Validate session configuration before mutating room state.
    const token = generateSessionToken(code, nickname);
    const { hash, salt } = hashPasscode(passcode);
    const room = await db.createRoom({ id: crypto.randomUUID(), code, name, passcode_hash: hash, salt, created_at: new Date().toISOString() });
    if (!room) throw new HttpError(409, 'ROOM_EXISTS', 'Room code already exists.');
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(pathname === '/api/rooms' ? publicRoom(room) : { room: publicRoom(room), token, nickname }));
    return true;
  }

  if (pathname === '/api/auth/join-room' && method === 'POST') {
    const ip = process.env.VERCEL === '1' ? String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
    const data = await parseJsonBody();
    const code = roomCode(data.code);
    const passcode = validatePasscode(data.passcode);
    const nickname = boundedText(data.nickname, 'Bạn cùng phòng', 'Nickname');
    // A success in another room cannot clear guesses against the target room.
    const keys = [limiterKey(`join-ip:${ip}`), limiterKey(`join-room:${code}`)];
    const login = await db.authenticateRoom(code, passcode, keys, verifyPasscode);
    if (login.rateLimited) throw new HttpError(429, 'RATE_LIMITED', 'Too many sign-in attempts.');
    const room = login.room;
    if (!room) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Room code or passcode is incorrect.');
    // Successful sign-ins do not clear accumulated failed attempts in the window.
    const token = generateSessionToken(code, nickname);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ room: publicRoom(room), token, nickname }));
    return true;
  }

  if (pathname === '/api/auth/verify-token' && method === 'POST') {
    const data = await parseJsonBody();
    const payload = verifySessionToken(data.token);
    const room = payload && await db.getRoom(payload.room_code);
    if (!payload || !room) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'Token không hợp lệ hoặc đã hết hạn.', code: 'UNAUTHORIZED' }));
      return true;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: true, payload, room: publicRoom(room) }));
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]+)$/);
  if (roomMatch && method === 'GET') {
    const code = assertRoomAccess(roomMatch[1], session);
    const room = await db.getRoom(code);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found', code: 'NOT_FOUND' }));
      return true;
    }
    const counts = await db.roomStats(code);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...publicRoom(room), ...counts }));
    return true;
  }

  // 4. Foods
  if (pathname === '/api/foods' && method === 'GET') {
    const room_code = assertRoomAccess(url.searchParams.get('room_code'), session);
    const statusFilter = url.searchParams.get('status');
    if (statusFilter !== null && !['active','consumed'].includes(statusFilter)) invalid('status must be active or consumed.');
    let items = await db.listFoods(room_code);
    
    items = items.map(publicFood);

    if (statusFilter === 'active') {
      items = items.filter(f => f.status !== 'CONSUMED');
    } else if (statusFilter === 'consumed') {
      items = items.filter(f => f.status === 'CONSUMED');
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items, total: items.length }));
    return true;
  }

  if (pathname === '/api/foods' && method === 'POST') {
    const data = await parseJsonBody();
    const id = crypto.randomUUID();
    const validated = foodDto(data);
    const shelfDays = validated.shelf_life_days;
    const addedDate = new Date();
    const expiryDate = new Date(addedDate.getTime() + shelfDays * 24 * 60 * 60 * 1000);
    const { days_remaining, status } = calculateStatusAndDays(expiryDate.toISOString());

    const food = {
      id,
      room_code: assertRoomAccess(data.room_code, session),
      name: validated.name,
      quantity: validated.quantity ?? '1 phần',
      compartment: validated.compartment,
      container_tag: validated.container_tag ?? '',
      added_date: addedDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      days_remaining,
      status,
      photo_url: validated.photo_url ?? null,
      storage_path: validated.storage_path ?? null,
      notes: validated.notes ?? null,
      created_by: session.nickname
    };

    await db.createFood(food);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(food));
    return true;
  }

  const foodConsumeMatch = pathname.match(/^\/api\/foods\/([a-zA-Z0-9_-]+)\/consume$/);
  if (foodConsumeMatch && method === 'PATCH') {
    const id = foodConsumeMatch[1];
    const data = await parseJsonBody();
    fields(data, ['add_to_shopping_list','consumed_by']);
    if (data.consumed_by !== undefined && typeof data.consumed_by !== 'string') invalid('consumed_by must be a string.');
    const food = publicFood(requireItem(await db.consumeFood(id, session.room_code, session.nickname, boolean(data.add_to_shopping_list, 'add_to_shopping_list', false))));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(food));
    return true;
  }

  const foodEditMatch = pathname.match(/^\/api\/foods\/([a-zA-Z0-9_-]+)$/);
  if (foodEditMatch && method === 'PATCH') {
    const data = foodDto(await parseJsonBody(), true);
    const updated = publicFood(requireItem(await db.updateFood(foodEditMatch[1], session.room_code, data)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(updated));
    return true;
  }

  const foodDeleteMatch = pathname.match(/^\/api\/foods\/([a-zA-Z0-9_-]+)$/);
  if (foodDeleteMatch && method === 'DELETE') {
    const id = foodDeleteMatch[1];
    requireItem(await db.deleteFood(id, session.room_code));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, deleted_id: id }));
    return true;
  }

  // 5. AI Parse Voice
  if (pathname === '/api/ai/parse-voice' && method === 'POST') {
    const customApiKey = req.headers['x-gemini-key'] || '';
    const data = await parseJsonBody();
    fields(data, ['transcript']);
    const transcript = text(data.transcript, 'transcript', 2000);
    const result = await parseVoiceWithGemini(transcript, customApiKey);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return true;
  }

  // 6. AI Suggest Recipes
  if (pathname === '/api/ai/suggest-recipes' && method === 'POST') {
    const customApiKey = req.headers['x-gemini-key'] || '';
    const data = await parseJsonBody();
    fields(data, ['room_code','preference']);
    const room_code = data.room_code;
    const preference = text(data.preference, 'preference', 2000, { optional: true, empty: true });
    assertRoomAccess(room_code, session);
    const availableFoods = (await db.listFoods(session.room_code)).filter(f => f.status !== 'CONSUMED');
    
    // Recalculate days remaining before passing to AI prompt
    const enrichedFoods = availableFoods.map(f => {
      const { days_remaining, status } = calculateStatusAndDays(f.expiry_date);
      return { ...f, days_remaining, status };
    });

    const suggestions = await suggestRecipesWithGemini(enrichedFoods, preference, customApiKey);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      suggestions,
      generated_at: new Date().toISOString()
    }));
    return true;
  }

  // 7. Shopping items
  if (pathname === '/api/shopping-items' && method === 'GET') {
    const room_code = assertRoomAccess(url.searchParams.get('room_code'), session);
    const items = (await db.listShopping(room_code)).map(publicShopping);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items, total: items.length }));
    return true;
  }

  if (pathname === '/api/shopping-items' && method === 'POST') {
    const data = await parseJsonBody();
    fields(data, ['room_code','name','quantity']);
    const id = crypto.randomUUID();
    const item = {
      id,
      room_code: assertRoomAccess(data.room_code, session),
      name: text(data.name, 'name', 200),
      quantity: text(data.quantity, 'quantity', 200, { optional: true, empty: true }) ?? '',
      is_bought: false,
      created_at: new Date().toISOString()
    };
    await db.createShopping(item);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(item));
    return true;
  }

  const shopToggleMatch = pathname.match(/^\/api\/shopping-items\/([a-zA-Z0-9_-]+)\/toggle$/);
  if (shopToggleMatch && method === 'PATCH') {
    const id = shopToggleMatch[1];
    const data = await parseJsonBody();
    fields(data, ['is_bought','move_to_fridge','compartment']);
    const bought = boolean(data.is_bought, 'is_bought');
    const move = boolean(data.move_to_fridge, 'move_to_fridge', false);
    if (move && !bought) invalid('Only bought items can move to the fridge.');
    const target = data.compartment === undefined ? 'FRIDGE_TOP' : compartment(data.compartment);
    const item = publicShopping(requireItem(await db.toggleShopping(id, session.room_code, bought, move, target, session.nickname)));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(item));
    return true;
  }

  const shopDeleteMatch = pathname.match(/^\/api\/shopping-items\/([a-zA-Z0-9_-]+)$/);
  if (shopDeleteMatch && method === 'DELETE') {
    const id = shopDeleteMatch[1];
    requireItem(await db.deleteShopping(id, session.room_code));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, deleted_id: id }));
    return true;
  }

  // 8. Notifications Subscribe
  if (pathname === '/api/notifications/subscribe' && method === 'POST') {
    const data = await parseJsonBody();
    assertRoomAccess(data.room_code, session);
    const validated = subscriptionDto(data);
    const subscription = await db.saveSubscription(session.room_code, validated.subscription, validated.device_name);
    const subscriber_id = subscription.id;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, subscriber_id }));
    return true;
  }

  if ((pathname === '/api/foods/consume-batch' && method === 'POST') || (pathname === '/api/notifications/config' && method === 'GET') || (pathname === '/api/notifications/subscribe' && method === 'DELETE') || (pathname === '/api/photos' && ['POST','DELETE'].includes(method))) throw new HttpError(503, 'SERVICE_UNAVAILABLE', 'This integration is not available yet.');

  return false;
}
