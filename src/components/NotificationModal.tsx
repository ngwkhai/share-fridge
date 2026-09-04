import React, { useEffect, useSyncExternalStore } from 'react';
import { Bell, Check, Smartphone, X } from 'lucide-react';
import { pushClient } from '../services/pushClient';
import { Dialog } from './Dialog';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose
}) => {
  const state = useSyncExternalStore(pushClient.subscribe, pushClient.getSnapshot);

  useEffect(() => {
    if (isOpen) void pushClient.inspect();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={state.busy}
      labelledBy="notification-modal-title"
      describedBy="notification-modal-description"
      overlayClassName="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      panelClassName="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-center relative"
    >
        <button
          type="button"
          onClick={onClose}
          disabled={state.busy}
          aria-label="Đóng thông báo"
          className="absolute right-3 top-3 w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="w-12 h-12 bg-fresh-100 text-fresh-700 rounded-2xl flex items-center justify-center mx-auto">
          <Bell className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 id="notification-modal-title" className="font-bold text-slate-900 text-base">Thông Báo Cảnh Báo Đồ Ăn</h3>
          <p id="notification-modal-description" className="text-xs text-slate-500">
            Nhận thông báo đẩy lên màn hình khóa khi có món sắp hết hạn hoặc khi bạn cùng phòng mua đồ mới.
          </p>
        </div>

        {state.message && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
            {state.message}
          </div>
        )}

        <div className="space-y-2">
          {!state.enabled ? (
            <button
              onClick={() => void pushClient.enable()}
              disabled={state.busy || !state.available}
              className="w-full min-h-11 py-3 bg-fresh-600 hover:bg-fresh-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Smartphone className="w-4 h-4" />
              <span>{state.busy ? 'Đang kích hoạt...' : 'Bật thông báo lên màn hình'}</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-1 text-fresh-600 text-xs font-bold py-2">
                <Check className="w-4 h-4" />
                <span>Đang hoạt động</span>
              </div>
              <button
                onClick={() => void pushClient.disable()}
                disabled={state.busy}
                className="w-full min-h-11 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold rounded-xl text-xs"
              >
                {state.busy ? 'Đang tắt...' : 'Tắt thông báo trên thiết bị này'}
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            disabled={state.busy}
            className="w-full min-h-11 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs disabled:opacity-50"
          >
            Đóng
          </button>
        </div>
    </Dialog>
  );
};
