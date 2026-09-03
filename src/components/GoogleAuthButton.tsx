import React, { useState } from 'react';

export interface GoogleUserProfile {
  name: string;
  email: string;
  picture?: string;
  sub: string;
}

interface GoogleAuthButtonProps {
  onSuccess: (profile: GoogleUserProfile) => void;
  onError?: (err: any) => void;
}

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);

  const handleGoogleClick = () => {
    setLoading(true);
    // Simulate / Trigger Google OAuth One-Tap & Identity Prompt
    setTimeout(() => {
      // Mock / Default Google Profile for fast onboarding
      const profile: GoogleUserProfile = {
        name: 'Nguyễn Đình Khải',
        email: 'khaind.hrt@gmail.com',
        picture: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
        sub: 'google-user-' + Math.floor(100000 + Math.random() * 900000)
      };
      onSuccess(profile);
      setLoading(false);
    }, 400);
  };

  return (
    <button
      type="button"
      onClick={handleGoogleClick}
      disabled={loading}
      className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 font-bold rounded-2xl text-xs flex items-center justify-center gap-2.5 shadow-2xs hover:shadow-xs transition-all active:scale-98 disabled:opacity-50"
    >
      {/* Official Multicolored Google 'G' Logo */}
      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
        />
      </svg>
      <span>{loading ? 'Đang kết nối Google...' : 'Tiếp tục với Google'}</span>
    </button>
  );
};
