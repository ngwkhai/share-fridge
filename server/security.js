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

export function validatedGoogleProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const [field, max] of [['sub',255],['name',100],['email',320]]) {
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > max) return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) return null;
  if (value.picture !== undefined) {
    if (typeof value.picture !== 'string' || value.picture.length > 1024) return null;
    try { const url = new URL(value.picture); if (url.protocol !== 'https:' || url.username || url.password) return null; } catch { return null; }
  }
  return { sub: value.sub, name: value.name, email: value.email, ...(value.picture ? { picture: value.picture } : {}) };
}

function signPayload(payload, purpose = '') {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  if (encoded.length + 44 > 4096) throw new HttpError(401, 'INVALID_GOOGLE_IDENTITY', 'Google identity is too large.');
  const signature = crypto.createHmac('sha256', sessionSecret()).update(purpose + encoded).digest('base64url');
  return `${encoded}.${signature}`;
}
function verifiedPayload(token, purpose = '') {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  const [encoded, signature] = parts;
  const expected = crypto.createHmac('sha256', sessionSecret()).update(purpose + encoded).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || actual.toString('base64url') !== signature || !crypto.timingSafeEqual(actual, expected)) return null;
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString()); } catch { return null; }
}
// exp defaults to a fresh SESSION_LIFETIME window; C-026 nickname renewal passes the
// original session's own exp through so the renewed token never extends the session.
export function generateSessionToken(roomCode, nickname = 'Bạn cùng phòng', googleProfile, exp = Date.now() + SESSION_LIFETIME) {
  const profile = googleProfile === undefined ? undefined : validatedGoogleProfile(googleProfile);
  if (profile === null) throw new HttpError(401, 'INVALID_GOOGLE_IDENTITY', 'Google identity is invalid.');
  return signPayload({ room_code: roomCode, nickname, exp, ...(profile ? { google_profile: profile } : {}) });
}
export function verifySessionToken(token) {
  const payload = verifiedPayload(token);
  if (!payload || typeof payload !== 'object' || !/^\d{6}$/.test(payload.room_code) || typeof payload.room_code !== 'string') return null;
  if (typeof payload.nickname !== 'string' || !payload.nickname.trim() || payload.nickname.length > 100) return null;
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() || payload.exp > Date.now() + SESSION_LIFETIME) return null;
  const profile = payload.google_profile === undefined ? undefined : validatedGoogleProfile(payload.google_profile);
  if (profile === null) return null;
  return { room_code: payload.room_code, nickname: payload.nickname, exp: payload.exp, ...(profile ? { google_profile: profile } : {}) };
}

const IDENTITY_LIFETIME = 10 * 60 * 1000;
const IDENTITY_PURPOSE = 'sharefridge:google-identity:v1:';
export function generateGoogleIdentity(profile, providerExpiry) {
  const validated = validatedGoogleProfile(profile);
  const exp = Math.min(Date.now() + IDENTITY_LIFETIME, providerExpiry);
  if (!validated || !Number.isSafeInteger(exp) || exp <= Date.now()) throw new HttpError(401, 'INVALID_GOOGLE_IDENTITY', 'Google identity is invalid.');
  return { profile: validated, identity_token: signPayload({ purpose: 'google-identity', profile: validated, exp }, IDENTITY_PURPOSE), expires_at: new Date(exp).toISOString() };
}
export function verifyGoogleIdentity(token) {
  const payload = verifiedPayload(token, IDENTITY_PURPOSE);
  if (!payload || payload.purpose !== 'google-identity' || !Number.isSafeInteger(payload.exp) || payload.exp <= Date.now() || payload.exp > Date.now() + IDENTITY_LIFETIME) return null;
  return validatedGoogleProfile(payload.profile);
}
