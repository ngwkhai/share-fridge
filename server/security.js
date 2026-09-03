import crypto from 'node:crypto';
import { HttpError } from './http.js';

const developmentSecret = crypto.randomBytes(32).toString('hex');
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

function sessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && Buffer.byteLength(configured) >= 32 && new Set(configured).size >= 16 && configured !== 'sharefridge-secure-salt-key-2026') return configured;
  if (process.env.NODE_ENV === 'production' || configured) {
    throw new HttpError(503, 'SESSION_UNAVAILABLE', 'Session service is not configured.');
  }
  // Local instances intentionally invalidate sessions on restart. Production
  // always requires an explicit, independently generated shared secret.
  return developmentSecret;
}

export function hashPasscode(passcode, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = `scrypt$${crypto.scryptSync(passcode, salt, 32).toString('hex')}`;
  return { hash, salt };
}

export function verifyPasscode(passcode, savedHash, salt) {
  if (typeof passcode !== 'string' || !passcode || typeof savedHash !== 'string' || typeof salt !== 'string' || !salt) return false;
  const modern = savedHash.startsWith('scrypt$');
  const expected = modern ? savedHash.slice(7) : savedHash;
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  // Keep legacy records readable; new records use scrypt. No database reset or
  // password replacement is needed to deploy the authorization correction.
  const actual = modern ? crypto.scryptSync(passcode, salt, 32) : crypto.pbkdf2Sync(passcode, salt, 1000, 32, 'sha256');
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function generateSessionToken(roomCode, nickname = 'Bạn cùng phòng') {
  const payload = { room_code: roomCode, nickname, exp: Date.now() + SESSION_LIFETIME };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [payloadStr, signature] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(payloadStr).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || actual.toString('base64url') !== signature || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString());
    if (!payload || typeof payload !== 'object' || !/^\d{6}$/.test(payload.room_code) || typeof payload.room_code !== 'string') return null;
    if (typeof payload.nickname !== 'string' || !payload.nickname.trim() || payload.nickname.length > 100) return null;
    if (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() || payload.exp > Date.now() + SESSION_LIFETIME) return null;
    return { room_code: payload.room_code, nickname: payload.nickname, exp: payload.exp };
  } catch {
    return null;
  }
}
