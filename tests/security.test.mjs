import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoginLimiter, createRateLimiter, createSessionToken, isSameOriginRequest, parseCookies, safeEqualText, verifySessionToken } from '../src/security.js';

const secret = 'test-session-secret-that-is-long-enough';

test('session tokens validate and expire', () => {
  const now = 1_800_000_000_000;
  const token = createSessionToken(secret, now);
  assert.equal(verifySessionToken(token, secret, now), true);
  assert.equal(verifySessionToken(token, secret, now + 13 * 60 * 60 * 1000), false);
  assert.equal(verifySessionToken(token, 'a-different-secret-that-is-long-enough', now), false);
});

test('tampered and malformed tokens are rejected', () => {
  const token = createSessionToken(secret);
  assert.equal(verifySessionToken(`${token}x`, secret), false);
  assert.equal(verifySessionToken('not-a-token', secret), false);
  assert.equal(verifySessionToken('', secret), false);
});

test('session creation rejects weak signing secrets', () => {
  assert.throws(() => createSessionToken('short-secret'), /at least 32 characters/);
});

test('constant-time string comparison handles unequal input lengths', () => {
  assert.equal(safeEqualText('same', 'same'), true);
  assert.equal(safeEqualText('same', 'diff'), false);
  assert.equal(safeEqualText('short', 'longer'), false);
});

test('cookie parser handles multiple cookies and encoded values', () => {
  assert.deepEqual({ ...parseCookies('a=one; portal_session=hello%20there; b=two') }, {
    a: 'one', portal_session: 'hello there', b: 'two'
  });
});

test('login limiter blocks repeated failures and resets on success', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, blockMs: 5000 });
  limiter.fail('ip', 100);
  assert.equal(limiter.check('ip', 200).allowed, true);
  limiter.fail('ip', 200);
  assert.equal(limiter.check('ip', 201).allowed, false);
  limiter.success('ip');
  assert.equal(limiter.check('ip', 202).allowed, true);
});


test('same-origin check accepts only explicit matching HTTP(S) origins', () => {
  assert.equal(isSameOriginRequest('https://portal.example', 'portal.example'), true);
  assert.equal(isSameOriginRequest('http://portal.example:8080', 'portal.example:8080'), true);
  assert.equal(isSameOriginRequest('https://attacker.example', 'portal.example'), false);
  assert.equal(isSameOriginRequest('ftp://portal.example', 'portal.example'), false);
  assert.equal(isSameOriginRequest('not a url', 'portal.example'), false);
  assert.equal(isSameOriginRequest('null', 'portal.example'), false);
  assert.equal(isSameOriginRequest(undefined, 'portal.example'), false);
  assert.equal(isSameOriginRequest('https://portal.example', undefined), false);
});


test('server login limiter export exists and applies the configured limit', () => {
  const limiter = createLoginLimiter({ limit: 1, windowMs: 1000, blockMs: 5000 });
  assert.equal(limiter.check('login-ip', 100).allowed, true);
  limiter.fail('login-ip', 100);
  assert.equal(limiter.check('login-ip', 101).allowed, false);
});


test('rate limiter expires old attempts and bounds stored client keys', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 100, blockMs: 200, maxEntries: 3 });
  limiter.fail('old', 0);
  assert.equal(limiter.check('old', 101).allowed, true);
  limiter.fail('a', 200);
  limiter.fail('b', 200);
  limiter.fail('c', 200);
  assert.ok(limiter.size <= 3);
});
