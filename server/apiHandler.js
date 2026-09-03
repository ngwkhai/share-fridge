import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPasscode, verifyPasscode, generateSessionToken, verifySessionToken, checkRateLimit, recordFailedAttempt, recordSuccessAttempt } from './security.js';
import { suggestRecipesWithGemini, parseVoiceWithGemini } from './geminiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiSpec = JSON.parse(fs.readFileSync(path.join(__dirname, 'openapi.json'), 'utf-8'));

// Initialize default rooms with hashed passcode '1234'
const defaultPass = hashPasscode('1234');

// In-Memory Database for local dev & server testing
export const db = {
  rooms: new Map([
    ['123456', { id: 'room-123456', code: '123456', name: 'Phòng Trọ 302', passcode_hash: defaultPass.hash, salt: defaultPass.salt, created_at: new Date().toISOString() }],
    ['839201', { id: 'room-839201', code: '839201', name: 'Phòng Cầu Giấy', passcode_hash: defaultPass.hash, salt: defaultPass.salt, created_at: new Date().toISOString() }]
  ]),
  foods: new Map([
    ['food-1', {
      id: 'food-1',
      room_code: '123456',
      name: 'Rau muống',
      quantity: '1 mớ',
      compartment: 'CRISPER',
      container_tag: 'Túi nilon đỏ',
      added_date: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      days_remaining: 1,
      status: 'COOK_SOON',
      photo_url: null,
      notes: 'Mua ở chợ hôm qua',
      created_by: 'Khải'
    }],
    ['food-2', {
      id: 'food-2',
      room_code: '123456',
      name: 'Thịt ba chỉ',
      quantity: '500g',
      compartment: 'FREEZER',
      container_tag: 'Hộp Lock nắp xanh',
      added_date: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      days_remaining: 10,
      status: 'FRESH',
      photo_url: null,
      notes: null,
      created_by: 'Khải'
    }]
  ]),
  shoppingItems: new Map([
    ['shop-1', { id: 'shop-1', room_code: '123456', name: 'Trứng gà (10 quả)', quantity: '1 vỉ', is_bought: false, created_at: new Date().toISOString() }]
  ]),
  subscribers: new Map()
};

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

export async function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  // Parse Body Helper
  const parseJsonBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });

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

  // Auth: Create Room with Passcode
  if (pathname === '/api/auth/create-room' && method === 'POST') {
    const data = await parseJsonBody();
    const code = (data.code || Math.floor(100000 + Math.random() * 900000).toString()).trim();
    const name = (data.name || `Phòng ${code.slice(0, 3)}`).trim();
    const passcode = (data.passcode || '1234').trim();
    const nickname = (data.nickname || 'Bạn cùng phòng').trim();

    const { hash, salt } = hashPasscode(passcode);
    const room = { id: `room-${code}`, code, name, passcode_hash: hash, salt, created_at: new Date().toISOString() };
    db.rooms.set(code, room);

    const token = generateSessionToken(code, nickname);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      room: { id: room.id, code: room.code, name: room.name, created_at: room.created_at },
      token,
      nickname
    }));
    return true;
  }

  // Auth: Join Room with Passcode + Rate Limit
  if (pathname === '/api/auth/join-room' && method === 'POST') {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: rateCheck.error }));
      return true;
    }

    const data = await parseJsonBody();
    const code = (data.code || '').trim();
    const passcode = (data.passcode || '').trim();
    const nickname = (data.nickname || 'Bạn cùng phòng').trim();

    const room = db.rooms.get(code);
    if (!room) {
      recordFailedAttempt(ip);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mã phòng không tồn tại.' }));
      return true;
    }

    // Verify passcode if room has one
    if (room.passcode_hash && !verifyPasscode(passcode, room.passcode_hash, room.salt)) {
      recordFailedAttempt(ip);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mật khẩu phòng không chính xác.' }));
      return true;
    }

    recordSuccessAttempt(ip);
    const token = generateSessionToken(code, nickname);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      room: { id: room.id, code: room.code, name: room.name, created_at: room.created_at },
      token,
      nickname
    }));
    return true;
  }

  // Auth: Verify Session Token
  if (pathname === '/api/auth/verify-token' && method === 'POST') {
    const data = await parseJsonBody();
    const payload = verifySessionToken(data.token);
    if (!payload) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'Token không hợp lệ hoặc đã hết hạn.' }));
      return true;
    }
    const room = db.rooms.get(payload.room_code);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ valid: true, payload, room }));
    return true;
  }

  // 3. Rooms
  if (pathname === '/api/rooms' && method === 'POST') {
    const data = await parseJsonBody();
    const code = data.code || Math.floor(100000 + Math.random() * 900000).toString();
    const name = data.name || `Phòng ${code.slice(0, 3)}`;
    const room = { id: `room-${code}`, code, name, created_at: new Date().toISOString() };
    db.rooms.set(code, room);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(room));
    return true;
  }

  const roomMatch = pathname.match(/^\/api\/rooms\/([a-zA-Z0-9_-]+)$/);
  if (roomMatch && method === 'GET') {
    const code = roomMatch[1];
    const room = db.rooms.get(code);
    if (!room) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Room not found' }));
      return true;
    }
    const foods = Array.from(db.foods.values()).filter(f => f.room_code === code && f.status !== 'CONSUMED');
    const urgentCount = foods.filter(f => f.status === 'COOK_SOON' || f.status === 'EXPIRED').length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...room, active_food_count: foods.length, urgent_food_count: urgentCount }));
    return true;
  }

  // 4. Foods
  if (pathname === '/api/foods' && method === 'GET') {
    const room_code = url.searchParams.get('room_code') || '123456';
    const statusFilter = url.searchParams.get('status');
    let items = Array.from(db.foods.values()).filter(f => f.room_code === room_code);
    
    // Recalculate dynamic days remaining
    items = items.map(f => {
      if (f.status === 'CONSUMED') return f;
      const { days_remaining, status } = calculateStatusAndDays(f.expiry_date);
      return { ...f, days_remaining, status };
    });

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
    const id = `food-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const shelfDays = Number(data.shelf_life_days) || 3;
    const addedDate = new Date();
    const expiryDate = new Date(addedDate.getTime() + shelfDays * 24 * 60 * 60 * 1000);
    const { days_remaining, status } = calculateStatusAndDays(expiryDate.toISOString());

    const food = {
      id,
      room_code: data.room_code || '123456',
      name: data.name,
      quantity: data.quantity || '1 phần',
      compartment: data.compartment || 'FRIDGE_TOP',
      container_tag: data.container_tag || '',
      added_date: addedDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      days_remaining,
      status,
      photo_url: data.photo_url || null,
      notes: data.notes || null,
      created_by: data.created_by || 'Bạn cùng phòng'
    };

    db.foods.set(id, food);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(food));
    return true;
  }

  const foodConsumeMatch = pathname.match(/^\/api\/foods\/([a-zA-Z0-9_-]+)\/consume$/);
  if (foodConsumeMatch && method === 'PATCH') {
    const id = foodConsumeMatch[1];
    const data = await parseJsonBody();
    const food = db.foods.get(id);
    if (!food) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Food item not found' }));
      return true;
    }
    food.status = 'CONSUMED';
    db.foods.set(id, food);

    if (data.add_to_shopping_list) {
      const shopId = `shop-${Date.now()}`;
      db.shoppingItems.set(shopId, {
        id: shopId,
        room_code: food.room_code,
        name: food.name,
        quantity: food.quantity,
        is_bought: false,
        created_at: new Date().toISOString()
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(food));
    return true;
  }

  const foodDeleteMatch = pathname.match(/^\/api\/foods\/([a-zA-Z0-9_-]+)$/);
  if (foodDeleteMatch && method === 'DELETE') {
    const id = foodDeleteMatch[1];
    db.foods.delete(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, deleted_id: id }));
    return true;
  }

  // 5. AI Parse Voice
  if (pathname === '/api/ai/parse-voice' && method === 'POST') {
    const customApiKey = req.headers['x-gemini-key'] || '';
    const { transcript } = await parseJsonBody();
    const result = await parseVoiceWithGemini(transcript, customApiKey);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return true;
  }

  // 6. AI Suggest Recipes
  if (pathname === '/api/ai/suggest-recipes' && method === 'POST') {
    const customApiKey = req.headers['x-gemini-key'] || '';
    const { room_code, preference } = await parseJsonBody();
    const availableFoods = Array.from(db.foods.values()).filter(f => f.room_code === (room_code || '123456') && f.status !== 'CONSUMED');
    
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
    const room_code = url.searchParams.get('room_code') || '123456';
    const items = Array.from(db.shoppingItems.values()).filter(i => i.room_code === room_code);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items }));
    return true;
  }

  if (pathname === '/api/shopping-items' && method === 'POST') {
    const data = await parseJsonBody();
    const id = `shop-${Date.now()}`;
    const item = {
      id,
      room_code: data.room_code || '123456',
      name: data.name,
      quantity: data.quantity || '',
      is_bought: false,
      created_at: new Date().toISOString()
    };
    db.shoppingItems.set(id, item);
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(item));
    return true;
  }

  const shopToggleMatch = pathname.match(/^\/api\/shopping-items\/([a-zA-Z0-9_-]+)\/toggle$/);
  if (shopToggleMatch && method === 'PATCH') {
    const id = shopToggleMatch[1];
    const data = await parseJsonBody();
    const item = db.shoppingItems.get(id);
    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Item not found' }));
      return true;
    }
    item.is_bought = data.is_bought;
    db.shoppingItems.set(id, item);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(item));
    return true;
  }

  const shopDeleteMatch = pathname.match(/^\/api\/shopping-items\/([a-zA-Z0-9_-]+)$/);
  if (shopDeleteMatch && method === 'DELETE') {
    const id = shopDeleteMatch[1];
    db.shoppingItems.delete(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return true;
  }

  // 8. Notifications Subscribe
  if (pathname === '/api/notifications/subscribe' && method === 'POST') {
    const data = await parseJsonBody();
    const subscriber_id = `sub-${Date.now()}`;
    db.subscribers.set(subscriber_id, data);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, subscriber_id }));
    return true;
  }

  return false;
}
