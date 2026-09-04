import React, { useEffect, useState } from 'react';
import { Settings, X, Copy, Check, Eye, EyeOff, ShieldCheck, LogOut, User, Edit3, Loader2 } from 'lucide-react';
import { Dialog } from './Dialog';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  roomName: string;
  passcode?: string;
  nickname?: string;
  googleEmail?: string;
  userAvatar?: string;
  onUpdateNickname?: (nick: string) => Promise<void>;
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
  userAvatar,
  onUpdateNickname,
  onLogout
}) => {
  const [showPasscode, setShowPasscode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const [copyError, setCopyError] = useState('');

  const [isEditingNick, setIsEditingNick] = useState(false);
  const [nickInput, setNickInput] = useState(nickname);
  const [savingNick, setSavingNick] = useState(false);
  const [nickError, setNickError] = useState('');

  // The server, not local typing, is the source of truth for the displayed nickname.
  // Only resync the input from the outside while the user isn't actively editing.
  useEffect(() => { if (!isEditingNick) setNickInput(nickname); }, [nickname, isEditingNick]);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      setCopyError('Không thể sao chép. Hãy tự chép thủ công.');
    }
  };

  const handleCopyPasscode = async () => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(passcode);
      setCopiedPasscode(true);
      setTimeout(() => setCopiedPasscode(false), 2000);
    } catch {
      setCopyError('Không thể sao chép. Hãy tự chép thủ công.');
    }
  };

  const handleSaveNick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickInput.trim() || !onUpdateNickname || savingNick) return;
    setSavingNick(true);
    setNickError('');
    try {
      await onUpdateNickname(nickInput.trim());
      setIsEditingNick(false);
    } catch (err) {
      // Non-destructive recovery: keep edit mode open with what the user typed.
      setNickError(err instanceof Error ? err.message : 'Không thể đổi tên. Vui lòng thử lại.');
    } finally {
      setSavingNick(false);
    }
  };

  const handleCancelNick = () => {
    if (savingNick) return;
    setNickInput(nickname);
    setNickError('');
    setIsEditingNick(false);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="settings-title"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      panelClassName="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Settings className="w-4 h-4" />
          </div>
          <h3 id="settings-title" className="font-extrabold text-slate-900 text-base tracking-tight">Cài Đặt & Bảo Mật</h3>
        </div>
        <button onClick={onClose} aria-label="Đóng cài đặt" className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* User Nickname Profile Card */}
      <div className="p-3.5 bg-fresh-500/10 rounded-2xl border border-fresh-200/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-fresh-600 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            <>{userAvatar ? <img src={userAvatar} alt={`Ảnh của ${nickname}`} referrerPolicy="no-referrer" className="w-9 h-9 rounded-xl object-cover" /> : <User className="w-4 h-4" />}</>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-fresh-800 font-bold uppercase tracking-wider">Tên của bạn</div>
            {!isEditingNick ? (
              <div className="font-black text-slate-900 text-sm truncate">{nickname}</div>
            ) : (
              <form onSubmit={handleSaveNick} className="space-y-1.5 mt-0.5">
                <div className="flex items-center gap-1">
                  <label className="sr-only" htmlFor="settings-nickname-input">Tên của bạn</label>
                  <input
                    id="settings-nickname-input"
                    data-autofocus
                    type="text"
                    value={nickInput}
                    maxLength={100}
                    onChange={(e) => setNickInput(e.target.value)}
                    disabled={savingNick}
                    className="min-w-0 flex-1 px-2 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-fresh-500 font-bold disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={savingNick || !nickInput.trim()}
                    aria-label="Lưu tên"
                    className="min-w-11 min-h-9 flex items-center justify-center bg-fresh-600 text-white rounded-lg text-xs font-bold disabled:opacity-60"
                  >
                    {savingNick ? <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelNick}
                    disabled={savingNick}
                    aria-label="Hủy đổi tên"
                    className="min-w-11 min-h-9 flex items-center justify-center bg-slate-100 text-slate-600 rounded-lg text-xs font-bold disabled:opacity-60"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {nickError && <p role="alert" className="text-[11px] font-semibold text-danger-700">{nickError}</p>}
              </form>
            )}
          </div>
        </div>
        {!isEditingNick && (
          <button
            onClick={() => setIsEditingNick(true)}
            aria-label="Sửa tên của bạn"
            className="min-w-11 min-h-11 flex items-center justify-center text-fresh-700 hover:text-fresh-900 hover:bg-fresh-100 rounded-lg transition-colors shrink-0"
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
            onClick={() => void handleCopyCode()}
            aria-label="Sao chép mã PIN phòng"
            className="min-h-11 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
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
              aria-label={showPasscode ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              className="min-w-11 min-h-11 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            >
              {showPasscode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => void handleCopyPasscode()}
              aria-label="Sao chép mật khẩu"
              className="min-h-11 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              {copiedPasscode ? <Check className="w-3.5 h-3.5 text-fresh-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPasscode ? 'Đã chép' : 'Sao chép'}</span>
            </button>
          </div>
        </div>

        {copyError && <p role="alert" className="text-[11px] font-semibold text-danger-700">{copyError}</p>}

        <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium pt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Xác thực Session Token bảo mật HMAC SHA-256</span>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={() => { onClose(); onLogout(); }}
        className="w-full min-h-11 py-3 bg-danger-500/10 hover:bg-danger-500/20 text-danger-700 border border-danger-200 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Rời khỏi phòng</span>
      </button>
    </Dialog>
  );
};
