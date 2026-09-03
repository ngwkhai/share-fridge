import React, { useState } from 'react';
import { Bell, Check, Smartphone } from 'lucide-react';
import { api } from '../services/api';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  roomCode
}) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleEnablePush = async () => {
    setLoading(true);
    setMessage('');
    try {
      if (!('Notification' in window)) {
        setMessage('Trình duyệt của bạn không hỗ trợ thông báo.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        // Mock subscribe or real registration
        await api.subscribeNotifications(roomCode, {
          endpoint: 'local-browser-subscription',
          keys: { auth: 'mock', p256dh: 'mock' }
        }, navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Android/Desktop');

        setEnabled(true);
        setMessage('Đã bật thông báo thành công! Bạn sẽ nhận thông báo nhắc lúc 16:30 hàng ngày.');
      } else {
        setMessage('Quyền thông báo bị từ chối.');
      }
    } catch {
      setMessage('Lỗi kích hoạt thông báo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-center">
        <div className="w-12 h-12 bg-fresh-100 text-fresh-700 rounded-2xl flex items-center justify-center mx-auto">
          <Bell className="w-6 h-6" />
        </div>

        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 text-base">Thông Báo Cảnh Báo Đồ Ăn</h3>
          <p className="text-xs text-slate-500">
            Nhận thông báo đẩy lên màn hình khóa khi có món sắp hết hạn hoặc khi bạn cùng phòng mua đồ mới.
          </p>
        </div>

        {message && (
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
            {message}
          </div>
        )}

        <div className="space-y-2">
          {!enabled ? (
            <button
              onClick={handleEnablePush}
              disabled={loading}
              className="w-full py-3 bg-fresh-600 hover:bg-fresh-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Smartphone className="w-4 h-4" />
              <span>{loading ? 'Đang kích hoạt...' : 'Bật thông báo lên màn hình'}</span>
            </button>
          ) : (
            <div className="flex items-center justify-center gap-1 text-fresh-600 text-xs font-bold py-2">
              <Check className="w-4 h-4" />
              <span>Đang hoạt động</span>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
