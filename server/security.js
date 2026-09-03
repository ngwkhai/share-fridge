import crypto from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || 'sharefridge-secure-salt-key-2026';

// Rate Limiter: Map<ip, { count: number, resetAt: number, lockedUntil: number }>
const rateLimitMap = new Map();

export function hashPasscode(passcode, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(passcode, salt, 1000, 32, 'sha256').toString('hex');
  return { hash, salt };
}

export function verifyPasscode(passcode, savedHash, salt) {
  if (!passcode || !savedHash || !salt) return false;
  const { hash } = hashPasscode(passcode, salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(savedHash));
}

export function generateSessionToken(roomCode, nickname = 'Bạn cùng phòng') {
  const payload = {
    room_code: roomCode,
    nickname,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET_KEY).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(payloadStr).digest('base64url');
  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null; // Expired
    return payload;
  } catch {
    return null;
  }
}

export function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000, lockedUntil: 0 };

  if (record.lockedUntil > now) {
    const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, error: `Quá nhiều lần thử sai. Vui lòng thử lại sau ${remainingSec} giây.`, status: 429 };
  }

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + 15 * 60 * 1000;
  }

  return { allowed: true, record };
}

export function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = now + 15 * 60 * 1000; // Lock for 15 mins
  }
  rateLimitMap.set(ip, record);
}

export function recordSuccessAttempt(ip) {
  rateLimitMap.delete(ip);
}
