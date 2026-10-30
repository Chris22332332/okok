import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'portal_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

function signature(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function safeEqualText(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createSessionToken(secret, now = Date.now()) {
  if (!secret || String(secret).length < 32) throw new Error('Session secret must contain at least 32 characters.');
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(18).toString('base64url')
  })).toString('base64url');
  return `${payload}.${signature(secret, payload)}`;
}

export function verifySessionToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret || String(secret).length < 32 || token.length > 2048) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
  const expected = signature(secret, payload);
  if (!safeEqualText(supplied, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isInteger(data.exp) && data.exp > Math.floor(now / 1000) && typeof data.nonce === 'string' && data.nonce.length >= 16;
  } catch {
    return false;
  }
}

export function isSameOriginRequest(origin, host) {
  if (typeof origin !== 'string' || !origin || typeof host !== 'string' || !host) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.username === '' && parsed.password === '' &&
      parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function parseCookies(header = '') {
  const cookies = Object.create(null);
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || Object.hasOwn(cookies, key)) continue;
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  }
  return cookies;
}

export function createRateLimiter({ limit = 8, windowMs = 10 * 60 * 1000, blockMs = 15 * 60 * 1000, maxEntries = 5000 } = {}) {
  const attempts = new Map();
  function prune(now) {
    if (attempts.size < maxEntries) return;
    for (const [key, value] of attempts) {
      if (now - value.startedAt > windowMs && value.blockedUntil <= now) attempts.delete(key);
      if (attempts.size < maxEntries) return;
    }
    while (attempts.size >= maxEntries) attempts.delete(attempts.keys().next().value);
  }
  return {
    check(key, now = Date.now()) {
      const current = attempts.get(key);
      if (!current) return { allowed: true, retryAfterMs: 0 };
      if (current.blockedUntil > now) return { allowed: false, retryAfterMs: current.blockedUntil - now };
      if (now - current.startedAt > windowMs) {
        attempts.delete(key);
        return { allowed: true, retryAfterMs: 0 };
      }
      return { allowed: current.count < limit, retryAfterMs: current.count >= limit ? Math.max(0, current.startedAt + windowMs - now) : 0 };
    },
    fail(key, now = Date.now()) {
      prune(now);
      const current = attempts.get(key);
      if (!current || now - current.startedAt > windowMs) {
        attempts.set(key, { startedAt: now, count: 1, blockedUntil: 0 });
        return;
      }
      current.count += 1;
      if (current.count >= limit) current.blockedUntil = now + blockMs;
      attempts.set(key, current);
    },
    success(key) { attempts.delete(key); },
    clear() { attempts.clear(); },
    get size() { return attempts.size; }
  };
}

export function createLoginLimiter(options = {}) {
  return createRateLimiter(options);
}
