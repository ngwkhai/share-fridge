import { OAuth2Client } from 'google-auth-library';
import { HttpError } from './http.js';
import { generateGoogleIdentity, validatedGoogleProfile } from './security.js';

export function googleClientId() {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  return value && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value) ? value : null;
}
const unavailable = () => new HttpError(503, 'GOOGLE_UNAVAILABLE', 'Đăng nhập Google hiện chưa khả dụng. Hãy dùng tên và mã phòng.');
const invalid = () => new HttpError(401, 'INVALID_GOOGLE_CREDENTIAL', 'Không thể xác minh tài khoản Google. Vui lòng đăng nhập lại.');

export function createGoogleClient(options = {}, timeoutMs = 5000) {
  const client = new OAuth2Client(options);
  const request = client.transporter.request.bind(client.transporter);
  // The SDK adds retry:true at the call site, overriding transporter defaults.
  // Override the final request options and abort the actual certificate fetch.
  client.transporter.request = options => request({ ...options, retry: false, retryConfig: { retry: 0, noResponseRetries: 0, shouldRetry: () => false }, timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) });
  return client;
}

// Dependency injection replaces Google's certificate transport in signed-token
// tests. Production always uses the official verifier and Google's key rotation.
export function createGoogleVerifier(client = createGoogleClient(), timeoutMs = 6000) {
  return async credential => {
    const audience = googleClientId();
    if (!audience) throw unavailable();
    if (typeof credential !== 'string' || credential.length === 0 || credential.length > 8192) throw new HttpError(400, 'INVALID_INPUT', 'Google credential must contain 1 to 8192 characters.');
    try {
      const [header, payload, signature, extra] = credential.split('.');
      if (!header || !payload || !signature || extra !== undefined || JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'RS256') throw invalid();
    } catch { throw invalid(); }
    let timer;
    try {
      const ticket = await Promise.race([
        client.verifyIdToken({ idToken: credential, audience }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(unavailable()), timeoutMs); })
      ]);
      const claims = ticket.getPayload();
      const now = Date.now();
      // The SDK permits clock skew. The app requires credentials not yet expired.
      if (!claims || !['accounts.google.com','https://accounts.google.com'].includes(claims.iss) || claims.aud !== audience || (claims.azp !== undefined && claims.azp !== audience) || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now || !Number.isSafeInteger(claims.iat) || claims.iat * 1000 > now + 30000 || claims.email_verified !== true) throw invalid();
      const profile = validatedGoogleProfile({ sub: claims.sub, name: typeof claims.name === 'string' ? claims.name.slice(0,100) : claims.name, email: claims.email, ...(claims.picture ? { picture: claims.picture } : {}) });
      if (!profile) throw invalid();
      return generateGoogleIdentity(profile, claims.exp * 1000);
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Gaxios errors signal key-fetch/network failure; no provider payloads escape.
      if (error?.response || error?.code || /retrieve verification certificates/i.test(error?.message || '')) throw unavailable();
      throw invalid();
    } finally { clearTimeout(timer); }
  };
}
export const verifyGoogleCredential = createGoogleVerifier();
