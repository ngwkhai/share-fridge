import React, { useState } from 'react';
import { Settings, X, Copy, Check, Eye, EyeOff, ShieldCheck, LogOut, User, Edit3 } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  roomName: string;
  passcode?: string;
  nickname?: string;
  googleEmail?: string;
  onUpdateNickname?: (nick: string) => void;
  onLogout: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  roomName,
  passcode = '1234',
  nickname = 'Bạn cùng phòng',
  googleEmail,
  onUpdateNickname,
  onLogout
}) => {
  const [showPasscode, setShowPasscode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPasscode, setCopiedPasscode] = useState(false);

  const [isEditingNick, setIsEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState(nickname);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPasscode = () => {
    navigator.clipboard.writeText(passcode);
    setCopiedPasscode(true);
    setTimeout(() => setCopiedPasscode(false), 2000);
  };

  const handleSaveNick = (e: React.FormEvent) => {
    e.preventDefault();
    if (nickInput.trim() && onUpdateNickname) {
      onUpdateNickname(nickInput.trim());
      setIsEditingNick(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
              <Settings className="w-4 h-4" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-base tracking-tight">Cài Đặt & Bảo Mật</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Nickname Profile Card */}
        <div className="p-3.5 bg-fresh-500/10 rounded-2xl border border-fresh-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-fresh-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] text-fresh-800 font-bold uppercase tracking-wider">Tên của bạn</div>
              {!isEditingNick ? (
                <div className="font-black text-slate-900 text-sm">{nickname}</div>
              ) : (
                <form onSubmit={handleSaveNick} className="flex items-center gap-1 mt-0.5">
                  <input
                    type="text"
                    value={nickInput}
                    onChange={(e) => setNickInput(e.target.value)}
                    className="px-2 py-1 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-fresh-500 font-bold"
                    autoFocus
                  />
                  <button type="submit" className="p-1 bg-fresh-600 text-white rounded-lg text-xs font-bold">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}
            </div>
          </div>
          {!isEditingNick && (
            <button
              onClick={() => setIsEditingNick(true)}
              className="p-1.5 text-fresh-700 hover:text-fresh-900 hover:bg-fresh-100 rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {googleEmail && (
          <div className="px-3 py-2 bg-blue-50/80 rounded-xl border border-blue-200/60 flex items-center justify-between text-[11px] text-blue-900 font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>Google: {googleEmail}</span>
            </div>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-md font-bold">Đã liên kết</span>
          </div>
        )}

        {/* Room Info & Passcode Card */}
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Tên phòng:</span>
            <span className="font-bold text-slate-900 text-sm">{roomName}</span>
          </div>

          {/* Room PIN with Copy */}
          <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Mã PIN phòng</div>
              <div className="font-mono font-black text-fresh-600 text-base tracking-wider">#{roomCode}</div>
            </div>
            <button
              onClick={handleCopyCode}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              {copiedCode ? <Check className="w-3.5 h-3.5 text-fresh-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedCode ? 'Đã chép' : 'Sao chép'}</span>
            </button>
          </div>

          {/* Room Passcode with Show/Hide & Copy */}
          <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Mật khẩu bí mật</div>
              <div className="font-mono font-black text-slate-900 text-base tracking-wider">
                {showPasscode ? passcode : '••••'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowPasscode(!showPasscode)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              >
                {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={handleCopyPasscode}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                {copiedPasscode ? <Check className="w-3.5 h-3.5 text-fresh-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPasscode ? 'Đã chép' : 'Sao chép'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Xác thực Session Token bảo mật HMAC SHA-256</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => { onClose(); onLogout(); }}
          className="w-full py-3 bg-danger-500/10 hover:bg-danger-500/20 text-danger-700 border border-danger-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Rời khỏi phòng</span>
        </button>
      </div>
    </div>
  );
};
