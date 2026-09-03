import { FoodItem, CreateFoodDto, ParsedFoodItem, RecipeSuggestion, ShoppingItem, CreateShoppingItemDto, Room, RoomDetail } from '../types';

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

const getToken = () => localStorage.getItem('sharefridge_session_token') || '';

export const api = {
  sessionCache,
  foodCache,

  async getHealth(): Promise<{ status: string; version: string; timestamp: string }> {
    const res = await fetch('/healthz');
    return res.json();
  },

  async createRoomWithPasscode(code?: string, name?: string, passcode?: string, nickname?: string): Promise<{ room: Room; token: string; nickname: string }> {
    const res = await fetch('/api/auth/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, passcode, nickname })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi tạo phòng mới');
    }
    const data = await res.json();
    if (data.token) {
      sessionCache.save({
        code: data.room.code,
        name: data.room.name,
        passcode: passcode || '1234',
        nickname: nickname || data.nickname || 'Bạn cùng phòng',
        token: data.token,
        cached_at: Date.now()
      });
    }
    return data;
  },

  async joinRoomWithPasscode(code: string, passcode: string, nickname?: string): Promise<{ room: Room; token: string; nickname: string }> {
    const res = await fetch('/api/auth/join-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, passcode, nickname })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi đăng nhập phòng');
    }
    const data = await res.json();
    if (data.token) {
      sessionCache.save({
        code: data.room.code,
        name: data.room.name,
        passcode,
        nickname: nickname || data.nickname || 'Bạn cùng phòng',
        token: data.token,
        cached_at: Date.now()
      });
    }
    return data;
  },

  async verifyToken(token?: string): Promise<{ valid: boolean; payload?: any; room?: Room }> {
    const actualToken = token || getToken();
    if (!actualToken) return { valid: false };
    const res = await fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: actualToken })
    });
    return res.json();
  },

  async createRoom(code?: string, name?: string): Promise<Room> {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name })
    });
    return res.json();
  },

  async getRoom(code: string): Promise<RoomDetail> {
    const res = await fetch(`/api/rooms/${code}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) {
      // Auto-recreate in serverless environments if session cache is present
      const cache = sessionCache.get();
      if (cache && cache.code === code) {
        try {
          const rec = await this.createRoomWithPasscode(cache.code, cache.name, cache.passcode, cache.nickname);
          return {
            id: rec.room.id,
            code: rec.room.code,
            name: rec.room.name,
            created_at: rec.room.created_at,
            active_food_count: 0,
            urgent_food_count: 0
          };
        } catch {}
      }
      throw new Error('Không tìm thấy phòng');
    }
    return res.json();
  },

  async getFoods(roomCode: string, status?: 'active' | 'consumed'): Promise<{ items: FoodItem[]; total: number }> {
    const url = `/api/foods?room_code=${encodeURIComponent(roomCode)}${status ? `&status=${status}` : ''}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  },

  async addFood(dto: CreateFoodDto): Promise<FoodItem> {
    const res = await fetch('/api/foods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify(dto)
    });
    if (!res.ok) throw new Error('Không thể thêm thực phẩm');
    return res.json();
  },

  async consumeFood(id: string, notes?: string, autoShopping = true): Promise<FoodItem> {
    const res = await fetch(`/api/foods/${id}/consume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ notes, auto_shopping: autoShopping })
    });
    return res.json();
  },

  async deleteFood(id: string): Promise<void> {
    await fetch(`/api/foods/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
  },

  async getShoppingItems(roomCode: string): Promise<{ items: ShoppingItem[]; total: number }> {
    const res = await fetch(`/api/shopping-items?room_code=${encodeURIComponent(roomCode)}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return { items: [], total: 0 };
    return res.json();
  },

  async addShoppingItem(dto: CreateShoppingItemDto): Promise<ShoppingItem> {
    const res = await fetch('/api/shopping-items', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify(dto)
    });
    return res.json();
  },

  async toggleShoppingItem(id: string, isBought: boolean): Promise<ShoppingItem> {
    const res = await fetch(`/api/shopping-items/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ is_bought: isBought })
    });
    return res.json();
  },

  async deleteShoppingItem(id: string): Promise<void> {
    await fetch(`/api/shopping-items/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
  },

  async parseVoice(transcript: string): Promise<{ parsed: ParsedFoodItem; confidence: number; source: string }> {
    const res = await fetch('/api/ai/parse-voice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ transcript })
    });
    return res.json();
  },

  async suggestRecipes(roomCode: string): Promise<{ suggestions: RecipeSuggestion[]; source: string }> {
    const res = await fetch('/api/ai/suggest-recipes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ room_code: roomCode })
    });
    return res.json();
  },

  async subscribePush(subscription: PushSubscriptionJSON, roomCode: string, deviceName?: string) {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        room_code: roomCode,
        subscription,
        device_name: deviceName || (navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Android')
      })
    });
    return res.json();
  },

  async subscribeNotifications(roomCode: string, subscription: any, deviceName?: string) {
    return this.subscribePush(subscription, roomCode, deviceName);
  }
};
