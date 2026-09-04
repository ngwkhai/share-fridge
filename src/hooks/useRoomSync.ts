import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useRef } from 'react';
import { api } from '../services/api';
import { createRoomSyncController, type RoomSyncDelta } from '../services/roomSync';
import { createRealtimeSubscription } from '../services/supabaseClient';

export function useRoomSync() {
  const realtime = useRef<ReturnType<typeof createRealtimeSubscription> | null>(null);
  const controller = useMemo(() => createRoomSyncController({
    online: () => navigator.onLine !== false,
    cached: code => api.foodCache.getSnapshot(code),
    save: (code, snapshot) => api.foodCache.saveSnapshot(code, snapshot),
    invalidate: session => { if (api.sessionCache.get()?.token === session.token) api.sessionCache.clear(); },
    read: async session => {
      const [verified, room, active, consumed, shopping] = await Promise.all([
        api.verifyToken(session.token), api.getRoom(session.code), api.getFoods(session.code, 'active'), api.getFoods(session.code, 'consumed'), api.getShoppingItems(session.code)
      ]);
      if (verified.room.code !== session.code) throw new Error('Phòng đã thay đổi.');
      return { room, foods: active.items, consumed: consumed.items, shopping: shopping.items, savedAt: Date.now() };
    },
  }), []);
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  useEffect(() => {
    let stopRealtime: (() => void) | undefined;
    const activate = () => {
      stopRealtime?.();
      realtime.current = null;
      const session = api.sessionCache.get();
      controller.activate(session);
      if (session) {
        const subscription = createRealtimeSubscription(session.code, { ...controller.capture(), delta: controller.applyDelta });
        realtime.current = subscription;
        stopRealtime = subscription.stop;
        void controller.refresh();
      }
    };
    const unsubscribe = api.sessionCache.subscribe(activate);
    const changed = () => controller.connectivityChanged();
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    activate();
    return () => { unsubscribe(); stopRealtime?.(); controller.activate(null); window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, [controller]);
  const token = state.session?.token || '';
  const mutate = useCallback(<T,>(operation: () => Promise<T>, toDelta?: (value: T) => RoomSyncDelta | RoomSyncDelta[]) => controller.mutate(token, operation, value => {
    const deltas = toDelta?.(value);
    for (const delta of deltas ? (Array.isArray(deltas) ? deltas : [deltas]) : []) void realtime.current?.publish(delta);
  }), [controller, token]);
  return { ...state, refresh: controller.refresh, mutate, logout: () => api.sessionCache.clear() };
}
