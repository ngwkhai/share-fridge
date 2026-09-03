import type { FoodItem, RoomDetail, ShoppingItem } from '../types';
import type { SessionCache } from './api';

export interface RoomSnapshot { room: RoomDetail; foods: FoodItem[]; consumed: FoodItem[]; shopping: ShoppingItem[]; savedAt: number }
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

// App uses this controller directly. A generation owns every callback and queued
// write; a refresh ticket additionally prevents older snapshots replacing newer ones.
export function createRoomSyncController(deps: Dependencies) {
  let generation = 0, ticket = 0, transport: 'polling' | 'connected' | 'connecting' = 'connecting';
  let queue: Promise<unknown> = Promise.resolve();
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
      generation++; ticket++; queue = Promise.resolve(); transport = 'connecting';
      emit({ session, snapshot: session ? deps.cached(session.code) : null, pending: 0, refreshing: false, stale: true, error: '', status: deps.online() ? 'connecting' : 'offline' });
    },
    capture() {
      const epoch = generation;
      return {
        refresh: () => current(epoch) ? controller.refresh() : Promise.resolve(),
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
    async mutate<T>(expectedToken: string, operation: () => Promise<T>): Promise<T> {
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
    connectivityChanged() {
      ticket++;
      emit({ stale: true, refreshing: false, status: deps.online() ? 'reconnecting' : 'offline' });
      if (deps.online()) void controller.refresh();
    },
  };
  return controller;
}
