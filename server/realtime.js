import crypto from 'node:crypto';
import { HttpError } from './http.js';

// This adapter supports Supabase's legacy HS256 project secret and anon JWT.
// A publishable key alone cannot prove that our signing secret belongs to it.
export function realtimeConfig(env = process.env, now = Date.now()) {
  try {
    const secret = env.SUPABASE_JWT_SECRET;
    const url = new URL(env.SUPABASE_URL);
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32 || new Set(secret).size < 16 || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname)) return null;
    const parts = String(env.SUPABASE_ANON_KEY || '').split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    const signature = Buffer.from(parts[2], 'base64url');
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    if (header.alg !== 'HS256' || claims.role !== 'anon' || claims.ref !== url.hostname.split('.')[0] || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now || signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) return null;
    return { secret, url: url.origin };
  } catch { return null; }
}

export async function realtimeAvailable(repository) {
  return Boolean(realtimeConfig() && repository?.kind === 'postgres' && await repository.realtimeReady?.());
}

export function issueRealtimeToken(room, session, config = realtimeConfig(), now = Date.now()) {
  if (!config) throw new HttpError(503, 'REALTIME_UNAVAILABLE', 'Room synchronization is not configured.');
  const exp = Math.min(Math.floor(now / 1000) + 300, Math.floor(session.exp / 1000));
  if (exp <= Math.floor(now / 1000)) throw new HttpError(401, 'UNAUTHORIZED', 'A valid room session is required.');
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', aud: 'authenticated', role: 'authenticated', sub: room.id, room_code: session.room_code, iat: Math.floor(now / 1000), exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.secret).update(`${header}.${payload}`).digest('base64url');
  return { token: `${header}.${payload}.${signature}`, expires_at: new Date(exp * 1000).toISOString() };
}
