// Supabase Cloud Client & Realtime Sync Helper

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const metaEnv = (import.meta as any)?.env || {};
  const url = metaEnv.VITE_SUPABASE_URL || '';
  const anonKey = metaEnv.VITE_SUPABASE_ANON_KEY || '';
  if (url && anonKey) {
    return { url, anonKey };
  }
  return null;
}

export function isSupabaseEnabled(): boolean {
  return getSupabaseConfig() !== null;
}

/**
 * Realtime WebSocket listener helper
 * Connects to Supabase Realtime when credentials exist, otherwise operates on standard polling
 */
export function createRealtimeSubscription(
  roomCode: string,
  onFoodChange: () => void,
  onShoppingChange: () => void
) {
  const config = getSupabaseConfig();
  if (!config) {
    // Polling fallback
    const interval = setInterval(() => {
      onFoodChange();
      onShoppingChange();
    }, 4000);
    return () => clearInterval(interval);
  }

  try {
    // Standard WebSocket connection to Supabase Realtime endpoint
    const wsUrl = `${config.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${config.anonKey}&vsn=1.0.0`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // Join foods topic
      ws.send(JSON.stringify({
        topic: `realtime:public:foods:room_code=eq.${roomCode}`,
        event: 'phx_join',
        payload: {},
        ref: '1'
      }));
      // Join shopping_items topic
      ws.send(JSON.stringify({
        topic: `realtime:public:shopping_items:room_code=eq.${roomCode}`,
        event: 'phx_join',
        payload: {},
        ref: '2'
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.event === 'INSERT' || msg.event === 'UPDATE' || msg.event === 'DELETE') {
          if (msg.topic?.includes('foods')) onFoodChange();
          if (msg.topic?.includes('shopping_items')) onShoppingChange();
        }
      } catch (err) {
        console.error('Realtime message error:', err);
      }
    };

    return () => {
      try { ws.close(); } catch {}
    };
  } catch {
    const interval = setInterval(() => {
      onFoodChange();
      onShoppingChange();
    }, 4000);
    return () => clearInterval(interval);
  }
}
