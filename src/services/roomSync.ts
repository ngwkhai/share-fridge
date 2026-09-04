import type { FoodItem, RoomDetail, ShoppingItem } from '../types';
import type { SessionCache } from './api';

export interface RoomSnapshot { room: RoomDetail; foods: FoodItem[]; consumed: FoodItem[]; shopping: ShoppingItem[]; savedAt: number }
// A delta is an acceleration path only: the database-triggered invalidation and
// authoritative snapshot refresh still reconcile every room after reconnects.
// It contains no credentials and is validated again by the receiving controller.
export type RoomSyncDelta =
  | { resource: 'food'; operation: 'upsert'; item: FoodItem }
  | { resource: 'food'; operation: 'delete'; id: string; room_code: string }
  | { resource: 'shopping'; operation: 'upsert'; item: ShoppingItem }
  | { resource: 'shopping'; operation: 'delete'; id: string; room_code: string };
export type ConnectionStatus = 'connecting' | 'offline' | 'reconnecting' | 'polling' | 'connected';
export interface SyncState { session: SessionCache | null; snapshot: RoomSnapshot | null; status: ConnectionStatus; refreshing: boolean; pending: number; stale: boolean; error: string }
interface Dependencies {
  read: (session: SessionCache) => Promise<RoomSnapshot>;
  cached: (code: string) => RoomSnapshot | null;
  save: (code: string, snapshot: RoomSnapshot) => void;
  invalidate: (session: SessionCache) => void;
  online: () => boolean;
}
export class SyncError extends Error {
  constructor(message: string, public code: string) { super(message); this.name = 'SyncError'; }
}
const errorStatus = (error: unknown) => typeof error === 'object' && error !== null && 'status' in error ? error.status : 0;
const validDelta = (value: unknown): value is RoomSyncDelta => {
  const delta = value as RoomSyncDelta | null;
  if (!delta || typeof delta !== 'object' || (delta.resource !== 'food' && delta.resource !== 'shopping')) return false;
  if (delta.operation === 'delete') return typeof delta.id === 'string' && delta.id.length > 0 && /^\d{6}$/.test(delta.room_code);
  if (delta.operation !== 'upsert' || !delta.item || typeof delta.item !== 'object') return false;
  if (delta.resource === 'shopping') {
    const item = delta.item;
    return typeof item.id === 'string' && !!item.id && /^\d{6}$/.test(item.room_code) && typeof item.name === 'string' && typeof item.is_bought === 'boolean' && typeof item.created_at === 'string';
  }
  const item = delta.item;
  if (typeof item.id !== 'string' || !item.id || !/^\d{6}$/.test(item.room_code)) return false;
  return typeof item.name === 'string' && typeof item.compartment === 'string' && typeof item.added_date === 'string' && typeof item.expiry_date === 'string'
    && typeof item.days_remaining === 'number' && ['FRESH', 'COOK_SOON', 'EXPIRED', 'CONSUMED'].includes(item.status);
};

// App uses this controller directly. A generation owns every callback and queued
// write; a refresh ticket additionally prevents older snapshots replacing newer ones.
export function createRoomSyncController(deps: Dependencies) {
  let generation = 0, ticket = 0, transport: 'polling' | 'connected' | 'connecting' = 'connecting';
  let queue: Promise<unknown> = Promise.resolve();
  // Tombstones stop a delayed direct delta from visually resurrecting an ID which
  // has already been deleted in this browser. IDs are immutable and never reused.
  const deletedFoodIds = new Set<string>();
  const deletedShoppingIds = new Set<string>();
  let state: SyncState = { session: null, snapshot: null, status: 'connecting', refreshing: false, pending: 0, stale: true, error: '' };
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const current = (epoch: number) => epoch === generation && !!state.session;
  const fail = (error: unknown, epoch: number) => {
    if (!current(epoch)) return;
    if (errorStatus(error) === 401) {
      const session = state.session!;
      controller.activate(null);
      deps.invalidate(session);
      emit({ error: 'Phiên đã hết hạn. Vui lòng vào lại phòng.' });
    } else emit({ stale: true, status: deps.online() ? 'reconnecting' : 'offline', error: error instanceof Error ? error.message : 'Không thể cập nhật dữ liệu.' });
  };
  const controller = {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate(session: SessionCache | null) {
      generation++; ticket++; queue = Promise.resolve(); transport = 'connecting'; deletedFoodIds.clear(); deletedShoppingIds.clear();
      emit({ session, snapshot: session ? deps.cached(session.code) : null, pending: 0, refreshing: false, stale: true, error: '', status: deps.online() ? 'connecting' : 'offline' });
    },
    capture() {
      const epoch = generation;
      return {
        refresh: () => current(epoch) ? controller.refresh() : Promise.resolve(),
        delta: (delta: RoomSyncDelta) => current(epoch) && controller.applyDelta(delta),
        transport: (mode: typeof transport) => {
          if (!current(epoch)) return;
          transport = mode;
          if (mode === 'connected') { emit({ stale: true, status: 'reconnecting' }); return; }
          emit({ status: !deps.online() ? 'offline' : state.stale ? (state.snapshot ? 'reconnecting' : 'connecting') : mode });
        },
        error: (error: unknown) => fail(error, epoch),
      };
    },
    async refresh() {
      if (!state.session || state.pending) return;
      if (!deps.online()) { emit({ status: 'offline', stale: true, refreshing: false }); return; }
      const epoch = generation, request = ++ticket, session = state.session;
      emit({ refreshing: true });
      try {
        const snapshot = await deps.read(session);
        if (!current(epoch) || request !== ticket) return;
        // Empty is a full, authoritative snapshot. Cache is never replayed to API.
        deps.save(session.code, snapshot);
        emit({ snapshot, stale: false, error: '', status: transport });
      } catch (error) { if (request === ticket) fail(error, epoch); }
      finally { if (current(epoch) && request === ticket) emit({ refreshing: false }); }
    },
    async mutate<T>(expectedToken: string, operation: () => Promise<T>, onSuccess?: (value: T) => void): Promise<T> {
      if (!state.session || state.session.token !== expectedToken) throw new SyncError('Phòng đã thay đổi. Vui lòng thử lại.', 'SESSION_CHANGED');
      if (!deps.online()) { emit({ status: 'offline', stale: true }); throw new SyncError('Đang ngoại tuyến. Kết nối mạng để lưu thay đổi.', 'OFFLINE'); }
      const epoch = generation;
      ticket++;
      emit({ pending: state.pending + 1, refreshing: false });
      const result = queue.then(async () => {
        if (!current(epoch)) throw new SyncError('Phiên đã thay đổi.', 'SESSION_CHANGED');
        if (!deps.online()) throw new SyncError('Đang ngoại tuyến. Chưa lưu thay đổi.', 'OFFLINE');
        return operation();
      });
      queue = result.catch(() => {});
      try {
        const value = await result;
        if (!current(epoch)) throw new SyncError('Phiên đã thay đổi.', 'SESSION_CHANGED');
        // Notify peers before this device's slower authoritative refresh. The
        // callback is deliberately synchronous/non-throwing: a best-effort peer
        // hint must never turn an accepted server write into a failed mutation.
        try { onSuccess?.(value); } catch { /* The accepted write remains successful if a peer hint cannot be prepared. */ }
        if (!current(epoch)) throw new SyncError('Phiên đã thay đổi.', 'SESSION_CHANGED');
        return value;
      }
      catch (error) {
        if (!current(epoch)) throw new SyncError('Phiên đã thay đổi.', 'SESSION_CHANGED');
        fail(error, epoch); throw error;
      }
      finally {
        if (current(epoch)) {
          ticket++;
          emit({ pending: state.pending - 1 });
          if (!state.pending) await controller.refresh();
        }
        if (!current(epoch)) throw new SyncError('Phiên đã thay đổi.', 'SESSION_CHANGED');
      }
    },
    applyDelta(delta: unknown) {
      const session = state.session, snapshot = state.snapshot;
      if (!validDelta(delta)) return false;
      const deltaRoomCode = delta.operation === 'upsert' ? delta.item.room_code : delta.room_code;
      if (!session || !snapshot || deltaRoomCode !== session.code) return false;
      const replace = <T extends { id: string }>(items: T[], item: T) => [...items.filter(existing => existing.id !== item.id), item];
      let foods = snapshot.foods, consumed = snapshot.consumed, shopping = snapshot.shopping;
      if (delta.resource === 'food') {
        if (delta.operation === 'delete') {
          deletedFoodIds.add(delta.id);
          foods = foods.filter(item => item.id !== delta.id);
          consumed = consumed.filter(item => item.id !== delta.id);
        } else {
          if (delta.item.room_code !== session.code || deletedFoodIds.has(delta.item.id)) return false;
          if (delta.item.status === 'CONSUMED') {
            foods = foods.filter(item => item.id !== delta.item.id);
            consumed = replace(consumed, delta.item);
          } else {
            consumed = consumed.filter(item => item.id !== delta.item.id);
            foods = replace(foods, delta.item);
          }
        }
      } else if (delta.operation === 'delete') {
        deletedShoppingIds.add(delta.id);
        shopping = shopping.filter(item => item.id !== delta.id);
      } else {
        if (delta.item.room_code !== session.code || deletedShoppingIds.has(delta.item.id)) return false;
        shopping = replace(shopping, delta.item);
      }
      // Cancel an in-flight older read before committing the visible delta.
      // Realtime's database invalidation will still run a later full reconciliation.
      ticket++;
      const room = {
        ...snapshot.room,
        active_food_count: foods.length,
        urgent_food_count: foods.filter(item => item.status === 'COOK_SOON' || item.status === 'EXPIRED').length,
      };
      const next = { room, foods, consumed, shopping, savedAt: Date.now() };
      deps.save(session.code, next);
      emit({ snapshot: next, refreshing: false, error: '' });
      return true;
    },
    connectivityChanged() {
      ticket++;
      emit({ stale: true, refreshing: false, status: deps.online() ? 'reconnecting' : 'offline' });
      if (deps.online()) void controller.refresh();
    },
  };
  return controller;
}
