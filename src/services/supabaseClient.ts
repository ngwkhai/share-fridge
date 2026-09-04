import { createClient } from '@supabase/supabase-js';
import { api } from './api';
import type { RoomSyncDelta } from './roomSync';

export function getSupabaseConfig() {
  const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
  try {
    const url = new URL(env.VITE_SUPABASE_URL);
    if (url.protocol !== 'https:' || !env.VITE_SUPABASE_ANON_KEY) return null;
    return { url: url.origin, anonKey: env.VITE_SUPABASE_ANON_KEY };
  } catch { return null; }
}

export function createRealtimeSubscription(
  roomCode: string,
  callbacks: { refresh: () => Promise<void>; transport: (mode: 'polling' | 'connected' | 'connecting') => void; error: (error: unknown) => void; delta?: (delta: RoomSyncDelta) => void },
  options?: { config?: ReturnType<typeof getSupabaseConfig>; clientFactory?: typeof createClient; getToken?: typeof api.getRealtimeToken }
) {
  const config = options?.config === undefined ? getSupabaseConfig() : options.config;
  let stopped = false, subscribed = false, client: ReturnType<typeof createClient> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;
  let connecting = false, channelGeneration = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let channel: ReturnType<ReturnType<typeof createClient>['channel']> | undefined;
  const refresh = () => { if (!stopped && navigator.onLine) void callbacks.refresh(); };
  // Polling is explicitly degraded. The slow timer also updates time-based expiry.
  const polling = setInterval(() => { if (!subscribed) refresh(); }, 4000);
  const clock = setInterval(refresh, 60000);
  const changed = () => {
    if (stopped || changeTimer) return;
    changeTimer = setTimeout(() => { changeTimer = undefined; refresh(); }, 30);
  };
  const isDelta = (value: unknown): value is RoomSyncDelta => {
    if (!value || typeof value !== 'object') return false;
    const delta = value as Record<string, unknown>;
    const item = delta.item as Record<string, unknown> | undefined;
    if (delta.resource !== 'food' && delta.resource !== 'shopping') return false;
    if (delta.operation === 'delete') return typeof delta.id === 'string' && typeof delta.room_code === 'string';
    return delta.operation === 'upsert' && !!item && typeof item.id === 'string' && typeof item.room_code === 'string';
  };
  const receiveDelta = (message: { payload?: unknown }) => {
    if (stopped || !isDelta(message.payload)) return;
    callbacks.delta?.(message.payload);
    // Reconcile after the visible fast path. This also covers a race where the
    // database invalidation arrived just before the client-published delta.
    changed();
  };
  const fallback = (error?: unknown) => {
    if (stopped) return;
    subscribed = false;
    callbacks.transport('polling');
    if (error) callbacks.error(error);
  };
  const recover = () => {
    if (stopped || reconnectTimer) return;
    channelGeneration++;
    const previous = client;
    client = undefined;
    if (previous) { void previous.removeAllChannels().catch(() => {}); previous.realtime.disconnect(); }
    clearTimeout(refreshTimer);
    reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, 5000);
  };
  const connect = async () => {
    if (stopped || connecting || !config || !navigator.onLine) return;
    connecting = true;
    try {
      const credential = await (options?.getToken || api.getRealtimeToken)();
      if (stopped) return;
      if (!client) client = (options?.clientFactory || createClient)(config.url, config.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      await client.realtime.setAuth(credential.token);
      if (stopped) return;
      if (!client.getChannels().length) {
        const generation = ++channelGeneration;
        channel = client.channel(`room-sync:${roomCode}`, { config: { private: true } })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_sync_versions', filter: `room_code=eq.${roomCode}` }, changed)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_sync_versions', filter: `room_code=eq.${roomCode}` }, changed)
          // C021: low-latency fast path (see supabase/realtime_broadcast.sql). The
          // postgres_changes listeners above stay as the reliability fallback --
          // if the broadcast RLS/extension is ever unavailable, sync still works,
          // just at the original (slower) WAL-based latency.
          .on('broadcast', { event: 'changed' }, changed)
          // A mutation source sends a validated, room-scoped delta after its REST
          // write succeeds. This avoids putting the visible peer update behind the
          // production REST round trip; the server-triggered `changed` event above
          // remains the source-of-truth reconciliation path.
          .on('broadcast', { event: 'delta' }, receiveDelta)
          .subscribe(status => {
            if (stopped || generation !== channelGeneration) return;
            subscribed = status === 'SUBSCRIBED';
            callbacks.transport(subscribed ? 'connected' : 'polling');
            if (subscribed) refresh();
            else if (['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)) recover();
          });
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void connect(); }, Math.max(1000, Date.parse(credential.expires_at) - Date.now() - 60000));
    } catch (error) {
      fallback(error);
      if (!stopped) { recover(); }
      if (!stopped && !reconnectTimer) refreshTimer = setTimeout(() => { void connect(); }, 30000);
    } finally { connecting = false; }
  };
  const online = () => { refresh(); void connect(); };
  const offline = () => { subscribed = false; callbacks.transport('connecting'); recover(); };
  const visible = () => { if (document.visibilityState === 'visible') online(); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visible);
  callbacks.transport(config ? 'connecting' : 'polling');
  void connect();
  const stop = () => {
    stopped = true;
    clearInterval(polling); clearInterval(clock); clearTimeout(refreshTimer); clearTimeout(changeTimer); clearTimeout(reconnectTimer);
    window.removeEventListener('online', online); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible);
    if (client) { void client.removeAllChannels().catch(() => {}); client.realtime.disconnect(); }
  };
  return {
    stop,
    async publish(delta: RoomSyncDelta) {
      if (stopped || !subscribed || !channel || !isDelta(delta)) return false;
      try {
        const result = await channel.send({ type: 'broadcast', event: 'delta', payload: delta });
        return result === 'ok';
      } catch { return false; }
    }
  };
}
