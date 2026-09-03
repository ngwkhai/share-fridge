import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { mountGoogleButton } from '../services/googleIdentity';
import type { GoogleIdentity } from '../types';

interface GoogleAuthButtonProps {
  onSuccess: (identity: GoogleIdentity) => void;
  onError?: (error: Error) => void;
}

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ onSuccess, onError }) => {
  const element = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSuccess, onError });
  callbacks.current = { onSuccess, onError };
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'waiting' | 'verifying' | 'unavailable' | 'error'>('loading');
  const [message, setMessage] = useState('Đang kiểm tra kết nối Google...');
  const current = useRef('');
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    const state = crypto.randomUUID();
    current.current = state;
    setStatus('loading'); setMessage('Đang kiểm tra kết nối Google...');
    void api.getConfig().then(async config => {
      if (!active) return;
      if (!config.capabilities.google || !config.google_client_id) { setStatus('unavailable'); setMessage('Đăng nhập Google hiện chưa khả dụng. Hãy dùng tên và mã phòng.'); return; }
      if (!element.current) return;
      const dispose = await mountGoogleButton(element.current, config.google_client_id, state, response => {
        if (!active || current.current !== state) return;
        setStatus('verifying'); setMessage('Đang xác minh tài khoản Google...');
        void api.verifyGoogleCredential(response.credential).then(identity => {
          if (!active || current.current !== state) return;
          setStatus('ready'); setMessage('Đã xác minh tài khoản Google. Nhập mật khẩu phòng để tiếp tục.');
          callbacks.current.onSuccess(identity);
        }).catch(error => {
          if (!active || current.current !== state) return;
          setStatus('error'); setMessage(error.message || 'Không thể xác minh Google. Hãy thử lại.'); callbacks.current.onError?.(error);
        });
      }, () => { if (active && current.current === state) { setStatus('waiting'); setMessage('Chọn tài khoản trong cửa sổ Google. Nếu đã đóng cửa sổ, bạn có thể thử lại hoặc dùng mã phòng.'); } });
      if (!active) { dispose(); return; }
      cleanup = dispose; setStatus('ready'); setMessage('Google giúp điền tên và ảnh. Bạn vẫn cần mật khẩu phòng.');
    }).catch(error => { if (active) { setStatus('error'); setMessage(error.message || 'Không thể kết nối Google.'); callbacks.current.onError?.(error); } });
    return () => { active = false; if (current.current === state) current.current = ''; cleanup?.(); };
  }, [attempt]);
  const cancel = () => { current.current = ''; setAttempt(value => value + 1); };
  return (
    <div className="space-y-2 text-left">
      <div ref={element} className={status === 'verifying' ? 'pointer-events-none opacity-50' : ''} aria-busy={status === 'verifying'} />
      <p role={status === 'error' ? 'alert' : 'status'} className="text-xs text-slate-600">{message}</p>
      {(status === 'waiting' || status === 'verifying') && <button type="button" onClick={cancel} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">Hủy đăng nhập Google</button>}
      {status === 'error' && <button type="button" onClick={cancel} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm text-slate-700">Thử lại Google</button>}
    </div>
  );
};
