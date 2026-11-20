import crypto from 'node:crypto';
import { config } from '../config.js';

// ---- Hash password: scrypt (N=16384, r=8, p=1), format "scrypt:<salt hex>:<hash hex>"
// (Di Supabase bagian ini digantikan oleh Supabase Auth.)
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---- Token bertanda tangan HMAC (stateless, mirip JWT HS256 sederhana)
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', config.tokenSecret).update(data).digest('base64url');

export function signToken(payload) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + config.tokenTtlSeconds }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch {
    return null;
  }
}
