import React from 'react';
import { Users, Bell, RefreshCw, Settings } from 'lucide-react';

interface HeaderProps {
  roomCode: string;
  roomName: string;
  nickname?: string;
  userAvatar?: string;
  onRefresh: () => void;
  onChangeRoom: () => void;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  loading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  roomCode,
  roomName,
  nickname = 'Bạn cùng phòng',
  userAvatar,
  onRefresh,
  onChangeRoom,
  onOpenNotifications,
  onOpenSettings,
  loading
}) => {
  return (
    <header className="glass-header px-4 py-3 sticky top-0 z-30 shadow-xs">
      <div className="flex items-center justify-between">
        {/* Brand, User Nickname & Room Info */}
        <div className="flex items-center gap-3">
          <div className="relative">
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={nickname}
                className="w-10 h-10 rounded-2xl object-cover ring-2 ring-fresh-400/40 shadow-md"
              />
            ) : (
              <img
                src="/logo.jpg"
                alt="ShareFridge"
                className="w-10 h-10 rounded-2xl object-cover ring-2 ring-fresh-400/40 shadow-md"
              />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-fresh-500 border-2 border-white rounded-full"></span>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-slate-900 text-sm leading-tight tracking-tight">
                {nickname}
              </h1>
              <span className="text-[10px] bg-fresh-50 text-fresh-700 font-bold px-1.5 py-0.2 rounded-full border border-fresh-200">
                Online
              </span>
            </div>

            {/* Room Name & PIN Tag */}
            <button
              onClick={onChangeRoom}
              className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-semibold transition-colors mt-0.5"
            >
              <Users className="w-3 h-3 text-slate-400" />
              <span>{roomName}</span>
              <span className="font-mono text-fresh-700 font-bold bg-fresh-50/80 px-1 py-0.2 rounded-md border border-fresh-200 text-[10px]">
                #{roomCode}
              </span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-2xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 flex items-center justify-center transition-all shadow-2xs active:scale-95"
            title="Cài đặt phòng & tài khoản"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenNotifications}
            className="w-9 h-9 rounded-2xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 flex items-center justify-center transition-all shadow-2xs active:scale-95"
            title="Thông báo"
          >
            <Bell className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="w-9 h-9 rounded-2xl bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-slate-200/80 flex items-center justify-center transition-all shadow-2xs active:scale-95 disabled:opacity-50"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-fresh-600' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
