import type { FoodItem, CreateFoodDto, UpdateFoodDto, ParsedFoodItem, RecipeSuggestion, ShoppingItem, CreateShoppingItemDto, Room, RoomDetail, AuthSession, SessionPayload, CompartmentType } from '../types';

export interface SessionCache {
  code: string;
  name: string;
  passcode: string;
  nickname: string;
  token: string;
  cached_at: number;
  google_email?: string;
  user_avatar?: string;
}

const SESSION_CACHE_KEY = 'sharefridge_session_cache';

export const sessionCache = {
  save(cache: SessionCache) {
    try {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
      localStorage.setItem('sharefridge_room_code', cache.code);
      localStorage.setItem('sharefridge_session_token', cache.token);
    } catch {}
  },
  get(): SessionCache | null {
    try {
      const raw = localStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  clear() {
    try {
      localStorage.removeItem(SESSION_CACHE_KEY);
      localStorage.removeItem('sharefridge_room_code');
      localStorage.removeItem('sharefridge_session_token');
    } catch {}
  }
};

export const foodCache = {
  saveFoods(roomCode: string, foods: FoodItem[]) {
    try {
      localStorage.setItem(`sharefridge_foods_${roomCode}`, JSON.stringify(foods));
    } catch {}
  },
  getFoods(roomCode: string): FoodItem[] {
    try {
      const raw = localStorage.getItem(`sharefridge_foods_${roomCode}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  saveShopping(roomCode: string, items: ShoppingItem[]) {
    try {
      localStorage.setItem(`sharefridge_shopping_${roomCode}`, JSON.stringify(items));
    } catch {}
  },
  getShopping(roomCode: string): ShoppingItem[] {
    try {
      const raw = localStorage.getItem(`sharefridge_shopping_${roomCode}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },
  saveConsumed(roomCode: string, foods: FoodItem[]) {
    try {
      localStorage.setItem(`sharefridge_consumed_${roomCode}`, JSON.stringify(foods));
    } catch {}
  },
  getConsumed(roomCode: string): FoodItem[] {
    try {
      const raw = localStorage.getItem(`sharefridge_consumed_${roomCode}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
};

/** Failures remain failures, with a stable machine code and the actual HTTP status. */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string, public readonly path: string) {
    super(message);
    this.name = 'ApiError';
  }
}

type Guard<T> = (value: unknown) => value is T;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => string(value) && value.trim().length > 0;
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const date = (value: unknown): value is string => string(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const roomCode = (value: unknown): value is string => string(value) && /^\d{6}$/.test(value);
const compartment = (value: unknown): value is CompartmentType => string(value) && ['FREEZER','FRIDGE_TOP','FRIDGE_BOTTOM','CRISPER','DOOR'].includes(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(string);
const optional = (value: unknown, guard: (x: unknown) => boolean, nullable = false) => value === undefined || (nullable && value === null) || guard(value);
const room: Guard<Room> = (x): x is Room => object(x) && nonempty(x.id) && roomCode(x.code) && nonempty(x.name) && date(x.created_at);
const roomDetail: Guard<RoomDetail> = (x): x is RoomDetail => room(x) && object(x) && integer(x.active_food_count) && x.active_food_count >= 0 && integer(x.urgent_food_count) && x.urgent_food_count >= 0;
const profile = (x: unknown) => object(x) && nonempty(x.sub) && nonempty(x.name) && nonempty(x.email) && optional(x.picture, string);
const authSession: Guard<AuthSession> = (x): x is AuthSession => object(x) && room(x.room) && nonempty(x.token) && nonempty(x.nickname) && optional(x.google_profile, profile);
const sessionPayload: Guard<SessionPayload> = (x): x is SessionPayload => object(x) && roomCode(x.room_code) && nonempty(x.nickname) && integer(x.exp) && optional(x.google_profile, profile);
const food: Guard<FoodItem> = (x): x is FoodItem => object(x) && nonempty(x.id) && roomCode(x.room_code) && nonempty(x.name) && compartment(x.compartment) && date(x.added_date) && date(x.expiry_date) && integer(x.days_remaining) && string(x.status) && ['FRESH','COOK_SOON','EXPIRED','CONSUMED'].includes(x.status) && ['quantity','container_tag','created_by'].every(key => optional(x[key], string)) && ['photo_url','storage_path','notes','consumed_by'].every(key => optional(x[key], string, true)) && optional(x.consumed_at, date, true);
const shopping: Guard<ShoppingItem> = (x): x is ShoppingItem => object(x) && nonempty(x.id) && roomCode(x.room_code) && nonempty(x.name) && optional(x.quantity, string) && typeof x.is_bought === 'boolean' && date(x.created_at);
const list = <T>(guard: Guard<T>): Guard<{ items: T[]; total: number }> => (x): x is { items: T[]; total: number } => object(x) && Array.isArray(x.items) && x.items.every(guard) && integer(x.total) && x.total === x.items.length;
const parsed: Guard<ParsedFoodItem> = (x): x is ParsedFoodItem => object(x) && nonempty(x.name) && compartment(x.compartment) && integer(x.shelf_life_days) && x.shelf_life_days >= 0 && x.shelf_life_days <= 365 && optional(x.quantity, string) && optional(x.container_tag, string);
const recipe: Guard<RecipeSuggestion> = (x): x is RecipeSuggestion => object(x) && nonempty(x.id) && nonempty(x.title) && integer(x.cook_time_minutes) && x.cook_time_minutes > 0 && ['food_ids','ingredients_used','ingredients_missing','instructions'].every(key => strings(x[key]));
const source = (x: unknown) => x === 'gemini-2.5-flash' || x === 'heuristic';
const deleted = (id: string): Guard<{ success: true; deleted_id: string }> => (x): x is { success: true; deleted_id: string } => object(x) && x.success === true && x.deleted_id === id;

const getToken = () => {
  try { return localStorage.getItem('sharefridge_session_token') || ''; }
  catch { return ''; }
};

async function request<T>(path: string, validate: Guard<T>, options: { method?: string; body?: unknown; public?: boolean } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.public ? {} : { Authorization: `Bearer ${getToken()}` }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError('Không thể kết nối máy chủ. Vui lòng thử lại.', 0, 'NETWORK_ERROR', path);
  }
  let data: unknown;
  try { data = await response.json(); }
  catch {
    throw new ApiError(response.ok ? 'Phản hồi máy chủ không hợp lệ.' : 'Yêu cầu không thành công.', response.status, response.ok ? 'INVALID_RESPONSE' : 'HTTP_ERROR', path);
  }
  if (!response.ok) {
    if (object(data) && nonempty(data.error) && nonempty(data.code)) throw new ApiError(data.error, response.status, data.code, path);
    throw new ApiError('Yêu cầu không thành công.', response.status, 'HTTP_ERROR', path);
  }
  if (!validate(data)) throw new ApiError('Phản hồi máy chủ không đúng định dạng.', response.status, 'INVALID_RESPONSE', path);
  return data;
}

export const api = {
  sessionCache,
  foodCache,
  async getHealth() {
    return request('/healthz', (x): x is { status: 'ok'; version: string; timestamp: string } => object(x) && x.status === 'ok' && nonempty(x.version) && date(x.timestamp), { public: true });
  },
  async createRoomWithPasscode(code?: string, name?: string, passcode?: string, nickname?: string): Promise<AuthSession> {
    const data = await request('/api/auth/create-room', authSession, { method: 'POST', public: true, body: { code, name, passcode, nickname } });
    sessionCache.save({ code: data.room.code, name: data.room.name, passcode: passcode || '', nickname: data.nickname, token: data.token, cached_at: Date.now() });
    return data;
  },
  async joinRoomWithPasscode(code: string, passcode: string, nickname?: string): Promise<AuthSession> {
    const data = await request('/api/auth/join-room', authSession, { method: 'POST', public: true, body: { code, passcode, nickname } });
    sessionCache.save({ code: data.room.code, name: data.room.name, passcode, nickname: data.nickname, token: data.token, cached_at: Date.now() });
    return data;
  },
  async verifyToken(token?: string) {
    return request('/api/auth/verify-token', (x): x is { valid: true; payload: SessionPayload; room: Room } => object(x) && x.valid === true && sessionPayload(x.payload) && room(x.room), { method: 'POST', public: true, body: { token: token || getToken() } });
  },
  async createRoom(code?: string, name?: string, passcode?: string): Promise<Room> {
    return request('/api/rooms', room, { method: 'POST', public: true, body: { code, name, passcode } });
  },
  async getRoom(code: string): Promise<RoomDetail> {
    return request(`/api/rooms/${encodeURIComponent(code)}`, roomDetail);
  },
  async getFoods(code: string, status?: 'active' | 'consumed') {
    return request(`/api/foods?room_code=${encodeURIComponent(code)}${status ? `&status=${encodeURIComponent(status)}` : ''}`, list(food));
  },
  async addFood(dto: CreateFoodDto): Promise<FoodItem> {
    return request('/api/foods', food, { method: 'POST', body: dto });
  },
  async updateFood(id: string, dto: UpdateFoodDto): Promise<FoodItem> {
    return request(`/api/foods/${encodeURIComponent(id)}`, food, { method: 'PATCH', body: dto });
  },
  // Retain the existing third positional option; notes were never a consume field.
  async consumeFood(id: string, _notes?: string, autoShopping = true): Promise<FoodItem> {
    return request(`/api/foods/${encodeURIComponent(id)}/consume`, food, { method: 'PATCH', body: { add_to_shopping_list: autoShopping } });
  },
  async deleteFood(id: string): Promise<void> {
    await request(`/api/foods/${encodeURIComponent(id)}`, deleted(id), { method: 'DELETE' });
  },
  async getShoppingItems(code: string) {
    return request(`/api/shopping-items?room_code=${encodeURIComponent(code)}`, list(shopping));
  },
  async addShoppingItem(dto: CreateShoppingItemDto): Promise<ShoppingItem> {
    return request('/api/shopping-items', shopping, { method: 'POST', body: dto });
  },
  async toggleShoppingItem(id: string, isBought: boolean, moveToFridge = false, targetCompartment?: CompartmentType): Promise<ShoppingItem> {
    return request(`/api/shopping-items/${encodeURIComponent(id)}/toggle`, shopping, { method: 'PATCH', body: { is_bought: isBought, move_to_fridge: moveToFridge, compartment: targetCompartment } });
  },
  async deleteShoppingItem(id: string): Promise<void> {
    await request(`/api/shopping-items/${encodeURIComponent(id)}`, deleted(id), { method: 'DELETE' });
  },
  async parseVoice(transcript: string) {
    return request('/api/ai/parse-voice', (x): x is { parsed: ParsedFoodItem; confidence: number; source: string } => object(x) && parsed(x.parsed) && typeof x.confidence === 'number' && x.confidence >= 0 && x.confidence <= 1 && source(x.source), { method: 'POST', body: { transcript } });
  },
  async suggestRecipes(code: string, preference?: string) {
    return request('/api/ai/suggest-recipes', (x): x is { suggestions: RecipeSuggestion[]; generated_at: string; source: string } => object(x) && Array.isArray(x.suggestions) && x.suggestions.every(recipe) && date(x.generated_at) && source(x.source), { method: 'POST', body: { room_code: code, preference } });
  },
  async subscribePush(subscription: PushSubscriptionJSON, roomCode: string, deviceName?: string) {
    return request('/api/notifications/subscribe', (x): x is { success: true; subscriber_id: string } => object(x) && x.success === true && nonempty(x.subscriber_id), { method: 'POST', body: { room_code: roomCode, subscription, device_name: deviceName } });
  },
  async subscribeNotifications(roomCode: string, subscription: PushSubscriptionJSON, deviceName?: string) {
    return this.subscribePush(subscription, roomCode, deviceName);
  }
};
