import type { RoomSnapshot } from './roomSync';
import type { FoodItem, CreateFoodDto, UpdateFoodDto, ParsedFoodItem, RecipeSuggestion, ShoppingItem, CreateShoppingItemDto, Room, RoomDetail, AuthSession, SessionPayload, CompartmentType, GoogleProfile, GoogleIdentity, PublicConfig } from '../types';

export interface SessionCache {
  code: string;
  name: string;
  passcode: string;
  nickname: string;
  token: string;
  cached_at: number;
  room?: Room;
  google_profile?: GoogleProfile;
}

const SESSION_CACHE_KEY = 'sharefridge_session_cache';
let sessionGeneration = 0;
const sessionListeners = new Set<() => void>();
const notifySession = () => { sessionGeneration++; sessionListeners.forEach(listener => listener()); };


export const sessionCache = {
  save(cache: SessionCache) {
    const { google_profile, ...rest } = cache;
    if (google_profile !== undefined && !profile(google_profile)) throw new Error('Invalid Google profile.');
    cache = { ...rest, ...(google_profile ? { google_profile: publicProfile(google_profile) } : {}) };
    try {
      localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
      localStorage.setItem('sharefridge_room_code', cache.code);
      localStorage.setItem('sharefridge_session_token', cache.token);
    } catch {}
    notifySession();
  },
  subscribe(listener: () => void) {
    sessionListeners.add(listener);
    const changed = (event: StorageEvent) => { if (event.key === SESSION_CACHE_KEY || event.key === null) notifySession(); };
    if (typeof window !== 'undefined') window.addEventListener('storage', changed);
    return () => { sessionListeners.delete(listener); if (typeof window !== 'undefined') window.removeEventListener('storage', changed); };
  },
  get(): SessionCache | null {
    try {
      const raw = localStorage.getItem(SESSION_CACHE_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (!object(value) || !roomCode(value.code) || !nonempty(value.name) || !nonempty(value.nickname) || !nonempty(value.token) || typeof value.cached_at !== 'number' || !optional(value.google_profile, profile)) return null;
      return { code: value.code, name: value.name, nickname: value.nickname, token: value.token, cached_at: value.cached_at, passcode: typeof value.passcode === 'string' ? value.passcode : '', ...(room(value.room) ? { room: value.room } : {}), ...(profile(value.google_profile) ? { google_profile: publicProfile(value.google_profile) } : {}) };
    } catch {
      return null;
    }
  },
  clear() {
    const previous = this.get();
    if (previous) foodCache.clear(previous.code);
    try {
      localStorage.removeItem(SESSION_CACHE_KEY);
      localStorage.removeItem('sharefridge_room_code');
      localStorage.removeItem('sharefridge_session_token');
    } catch {}
    notifySession();
  }
};

export const foodCache = {
  clear(code: string) {
    try { for (const key of ['snapshot','foods','consumed','shopping']) localStorage.removeItem(`sharefridge_${key}_${code}`); } catch {}
  },
  saveSnapshot(code: string, snapshot: RoomSnapshot) {
    try { localStorage.setItem(`sharefridge_snapshot_${code}`, JSON.stringify(snapshot)); } catch {}
    // Remove obsolete split caches so no older client can resurrect their contents.
    try { for (const key of ['foods','consumed','shopping']) localStorage.removeItem(`sharefridge_${key}_${code}`); } catch {}
  },
  getSnapshot(code: string): RoomSnapshot | null {
    try {
      const x = JSON.parse(localStorage.getItem(`sharefridge_snapshot_${code}`) || 'null');
      if (!object(x) || !roomDetail(x.room) || x.room.code !== code || typeof x.savedAt !== 'number' || !Array.isArray(x.foods) || !x.foods.every(food) || !Array.isArray(x.consumed) || !x.consumed.every(food) || !Array.isArray(x.shopping) || !x.shopping.every(shopping) || [...x.foods,...x.consumed,...x.shopping].some(item => item.room_code !== code)) return null;
      const age = (item: FoodItem): FoodItem => {
        const days = Math.ceil((Date.parse(item.expiry_date) - Date.now()) / 86400000);
        return { ...item, days_remaining: days, status: item.status === 'CONSUMED' ? 'CONSUMED' : days <= 0 ? 'EXPIRED' : days <= 2 ? 'COOK_SOON' : 'FRESH' };
      };
      return { room: x.room, foods: x.foods.map(age), consumed: x.consumed.map(age), shopping: x.shopping, savedAt: x.savedAt };
    } catch { return null; }
  },
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
const profile = (x: unknown): x is GoogleProfile => {
  if (!object(x) || !nonempty(x.sub) || x.sub.length > 255 || !nonempty(x.name) || x.name.length > 100 || !nonempty(x.email) || x.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)) return false;
  if (x.picture !== undefined) { if (!string(x.picture) || x.picture.length > 1024) return false; try { const url = new URL(x.picture); if (url.protocol !== 'https:' || url.username || url.password) return false; } catch { return false; } }
  return true;
};
const publicProfile = (x: GoogleProfile): GoogleProfile => ({ sub: x.sub, name: x.name, email: x.email, ...(x.picture ? { picture: x.picture } : {}) });
const authSession: Guard<AuthSession> = (x): x is AuthSession => object(x) && room(x.room) && nonempty(x.token) && nonempty(x.nickname) && optional(x.google_profile, profile);
const sessionPayload: Guard<SessionPayload> = (x): x is SessionPayload => object(x) && roomCode(x.room_code) && nonempty(x.nickname) && integer(x.exp) && optional(x.google_profile, profile);
const food: Guard<FoodItem> = (x): x is FoodItem => object(x) && nonempty(x.id) && roomCode(x.room_code) && nonempty(x.name) && compartment(x.compartment) && date(x.added_date) && date(x.expiry_date) && integer(x.days_remaining) && string(x.status) && ['FRESH','COOK_SOON','EXPIRED','CONSUMED'].includes(x.status) && ['quantity','container_tag','created_by'].every(key => optional(x[key], string)) && ['photo_url','storage_path','notes','consumed_by'].every(key => optional(x[key], string, true)) && optional(x.consumed_at, date, true);
const shopping: Guard<ShoppingItem> = (x): x is ShoppingItem => object(x) && nonempty(x.id) && roomCode(x.room_code) && nonempty(x.name) && optional(x.quantity, string) && typeof x.is_bought === 'boolean' && date(x.created_at);
const list = <T>(guard: Guard<T>): Guard<{ items: T[]; total: number }> => (x): x is { items: T[]; total: number } => object(x) && Array.isArray(x.items) && x.items.every(guard) && integer(x.total) && x.total === x.items.length;
const parsed: Guard<ParsedFoodItem> = (x): x is ParsedFoodItem => object(x) && nonempty(x.name) && compartment(x.compartment) && integer(x.shelf_life_days) && x.shelf_life_days >= 0 && x.shelf_life_days <= 365 && optional(x.quantity, string) && optional(x.container_tag, string);
const recipe: Guard<RecipeSuggestion> = (x): x is RecipeSuggestion => object(x) && nonempty(x.id) && nonempty(x.title) && integer(x.cook_time_minutes) && x.cook_time_minutes > 0 && ['food_ids','ingredients_used','ingredients_missing','instructions'].every(key => strings(x[key])) && Array.isArray(x.food_ids) && x.food_ids.length > 0 && x.food_ids.length <= 50 && new Set(x.food_ids).size === x.food_ids.length;
const source = (x: unknown) => x === 'gemini-3.1-flash-lite' || x === 'heuristic';
const deleted = (id: string): Guard<{ success: true; deleted_id: string }> => (x): x is { success: true; deleted_id: string } => object(x) && x.success === true && x.deleted_id === id;

const getToken = () => {
  try { return sessionCache.get()?.token || (localStorage.getItem(SESSION_CACHE_KEY) ? '' : localStorage.getItem('sharefridge_session_token') || ''); }
  catch { return ''; }
};

export interface PushDevice { room_code: string; subscriber_id: string; endpoint: string; owner: string }
export const pushDevice = {
  get(): PushDevice | null {
    try { const value=JSON.parse(localStorage.getItem('sharefridge_push_device') || 'null');
      return object(value)&&roomCode(value.room_code)&&nonempty(value.subscriber_id)&&nonempty(value.endpoint)&&nonempty(value.owner) ? value as unknown as PushDevice : null;
    } catch { return null; }
  },
  save(value: PushDevice) { localStorage.setItem('sharefridge_push_device',JSON.stringify(value)); },
  clear(owner?: string) { if (!owner || this.get()?.owner===owner) localStorage.removeItem('sharefridge_push_device'); }
};

async function request<T>(path: string, validate: Guard<T>, options: { method?: string; body?: unknown; public?: boolean; token?: string; timeoutMs?: number; headers?: Record<string,string> } = {}): Promise<T> {
  if (options.method && options.method !== 'GET' && typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('Đang ngoại tuyến. Kết nối mạng để lưu thay đổi.', 0, 'OFFLINE', path);
  let response: Response;
  const device=pushDevice.get(), current=sessionCache.get();
  const actor=device&&device.room_code===current?.code&&/\/api\/(foods|shopping-items)(\/|$)/.test(path)&&options.method&&options.method!=='GET' ? device.subscriber_id : null;
  try {
    response = await fetch(path, {
      method: options.method || 'GET',
      cache: 'no-store',
      ...(options.timeoutMs ? {signal:AbortSignal.timeout(options.timeoutMs)} : {}),
      headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.public ? {} : { Authorization: `Bearer ${options.token ?? getToken()}` }), ...(actor ? {'X-Push-Subscriber-Id':actor} : {}), ...(options.headers || {}) },
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
  pushDevice,
  foodCache,
  async getConfig(): Promise<PublicConfig> {
    return request('/api/config', (x): x is PublicConfig => object(x) && (x.google_client_id === null || nonempty(x.google_client_id)) && object(x.capabilities) && ['google','push','photos','realtime'].every(key => typeof (x.capabilities as Record<string,unknown>)[key] === 'boolean'), { public: true });
  },
  async verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
    const generation = sessionGeneration;
    const identity = await request('/api/auth/google', (x): x is GoogleIdentity => object(x) && profile(x.profile) && nonempty(x.identity_token) && date(x.expires_at) && Date.parse(x.expires_at) > Date.now(), { method: 'POST', public: true, body: { credential } });
    if (generation !== sessionGeneration) throw new ApiError('Phiên đã thay đổi. Vui lòng thử lại.', 0, 'SESSION_CHANGED', '/api/auth/google');
    return identity;
  },
  async getRealtimeToken() {
    return request('/api/realtime-token', (x): x is { token: string; expires_at: string } => object(x) && nonempty(x.token) && date(x.expires_at));
  },
  async getHealth() {
    return request('/healthz', (x): x is { status: 'ok'; version: string; timestamp: string } => object(x) && x.status === 'ok' && nonempty(x.version) && date(x.timestamp), { public: true });
  },
  async createRoomWithPasscode(code?: string, name?: string, passcode?: string, nickname?: string, googleIdentityToken?: string): Promise<AuthSession> {
    const generation = sessionGeneration;
    const data = await request('/api/auth/create-room', authSession, { method: 'POST', public: true, body: { code, name, passcode, nickname, google_identity_token: googleIdentityToken } });
    if (generation !== sessionGeneration) throw new ApiError('Phiên đã thay đổi. Vui lòng thử lại.', 0, 'SESSION_CHANGED', '/api/auth');
    sessionCache.save({ room: data.room, code: data.room.code, name: data.room.name, passcode: passcode || '', nickname: data.nickname, token: data.token, cached_at: Date.now(), ...(data.google_profile ? { google_profile: data.google_profile } : {}) });
    return data;
  },
  async joinRoomWithPasscode(code: string, passcode: string, nickname?: string, googleIdentityToken?: string): Promise<AuthSession> {
    const generation = sessionGeneration;
    const data = await request('/api/auth/join-room', authSession, { method: 'POST', public: true, body: { code, passcode, nickname, google_identity_token: googleIdentityToken } });
    if (generation !== sessionGeneration) throw new ApiError('Phiên đã thay đổi. Vui lòng thử lại.', 0, 'SESSION_CHANGED', '/api/auth');
    sessionCache.save({ room: data.room, code: data.room.code, name: data.room.name, passcode, nickname: data.nickname, token: data.token, cached_at: Date.now(), ...(data.google_profile ? { google_profile: data.google_profile } : {}) });
    return data;
  },
  // Renews the nickname on the server, then atomically replaces the local session
  // with the newly signed token. A late response after logout/room-change never
  // clobbers the replacement session (matches createRoom/joinRoom's own guard).
  async updateNickname(nickname: string): Promise<AuthSession> {
    const before = sessionCache.get();
    if (!before) throw new ApiError('Chưa có phiên phòng.', 0, 'NO_SESSION', '/api/auth/session');
    const data = await request('/api/auth/session', authSession, { method: 'PATCH', token: before.token, body: { nickname } });
    const current = sessionCache.get();
    if (!current || current.token !== before.token) throw new ApiError('Phiên đã thay đổi. Vui lòng thử lại.', 0, 'SESSION_CHANGED', '/api/auth/session');
    sessionCache.save({ ...current, room: data.room, code: data.room.code, name: data.room.name, nickname: data.nickname, token: data.token, ...(data.google_profile ? { google_profile: data.google_profile } : {}) });
    return data;
  },
  async verifyToken(token?: string) {
    const selectedToken = token || getToken();
    const result = await request('/api/auth/verify-token', (x): x is { valid: true; payload: SessionPayload; room: Room } => object(x) && x.valid === true && sessionPayload(x.payload) && room(x.room), { method: 'POST', public: true, body: { token: selectedToken } });
    const cache = sessionCache.get();
    if (cache?.token === selectedToken && JSON.stringify(cache.google_profile) !== JSON.stringify(result.payload.google_profile)) sessionCache.save({ ...cache, google_profile: result.payload.google_profile });
    return result;
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
  async consumeBatch(foodIds: string[], idempotencyKey: string, addToShoppingList = false) {
    return request('/api/foods/consume-batch', (x): x is { items: FoodItem[]; consumed_at: string } => object(x) && Array.isArray(x.items) && x.items.every(food) && x.items.length === foodIds.length && new Set(x.items.map(item => item.id)).size === foodIds.length && x.items.every(item => foodIds.includes(item.id) && item.status === 'CONSUMED' && item.consumed_at === x.consumed_at) && date(x.consumed_at), { method: 'POST', body: { food_ids: foodIds, idempotency_key: idempotencyKey, add_to_shopping_list: addToShoppingList } });
  },
  async parseVoice(transcript: string) {
    return request('/api/ai/parse-voice', (x): x is { parsed: ParsedFoodItem; confidence: number; source: string } => object(x) && parsed(x.parsed) && typeof x.confidence === 'number' && x.confidence >= 0 && x.confidence <= 1 && source(x.source), { method: 'POST', body: { transcript } });
  },
  async suggestRecipes(code: string, preference?: string) {
    return request('/api/ai/suggest-recipes', (x): x is { suggestions: RecipeSuggestion[]; generated_at: string; source: string } => object(x) && Array.isArray(x.suggestions) && x.suggestions.every(recipe) && date(x.generated_at) && source(x.source), { method: 'POST', body: { room_code: code, preference } });
  },
  async subscribePush(subscription: PushSubscriptionJSON, roomCode: string, deviceName?: string, token?: string) {
    return request('/api/notifications/subscribe', (x): x is { success: true; subscriber_id: string } => object(x) && x.success === true && nonempty(x.subscriber_id), { method: 'POST', body: { room_code: roomCode, subscription, device_name: deviceName }, token, timeoutMs:8000 });
  },
  async getPushConfig(token?: string) {
    return request('/api/notifications/config',(x): x is {enabled:boolean;public_key:string|null} => object(x)&&typeof x.enabled==='boolean'&&(x.enabled ? nonempty(x.public_key) : x.public_key===null),{token,timeoutMs:8000});
  },
  async uploadPhoto(imageBase64: string, mimeType: 'image/jpeg'|'image/png'|'image/webp', idempotencyKey?: string) {
    return request('/api/photos', (x): x is { photo_url: string; storage_path: string } => object(x) && nonempty(x.photo_url) && nonempty(x.storage_path), { method: 'POST', body: { image_base64: imageBase64, mime_type: mimeType }, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}, timeoutMs: 15000 });
  },
  async removePhoto(storagePath: string) {
    return request('/api/photos', (x): x is { success: true } => object(x) && x.success === true, { method: 'DELETE', body: { storage_path: storagePath }, timeoutMs: 8000 });
  },
  async unsubscribePush(endpoint:string,token?:string) {
    return request('/api/notifications/subscribe',(x): x is {success:true} => object(x)&&x.success===true,{method:'DELETE',body:{endpoint},token,timeoutMs:8000});
  },
  async subscribeNotifications(roomCode: string, subscription: PushSubscriptionJSON, deviceName?: string) {
    return this.subscribePush(subscription, roomCode, deviceName);
  }
};
