import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWispUpgrade } from '../src/wisp-upgrade.js';

function makeSocket() {
  return {
    ended: false,
    destroyed: false,
    response: '',
    end(value = '') { this.ended = true; this.response += value; },
    destroy() { this.destroyed = true; }
  };
}

function request(url = '/wisp/', origin = 'https://portal.example') {
  return { method: 'GET', url, headers: { host: 'portal.example', origin, upgrade: 'websocket', connection: 'keep-alive, Upgrade' } };
}

const sameOrigin = (req) => req.headers.origin === `https://${req.headers.host}`;
const validSession = () => true;

test('Wisp route accepts the exact mounted path and strips query strings before routing', () => {
  const req = request('/wisp/?debug=1');
  const socket = makeSocket();
  let routedUrl;
  const result = handleWispUpgrade(req, socket, Buffer.alloc(0), {
    wisp: { routeRequest(value) { routedUrl = value.url; } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession
  });
  assert.equal(result, 'routed');
  assert.equal(routedUrl, '/wisp/');
  assert.equal(socket.ended, false);
});

test('Wisp upgrade ignores unrelated paths without invoking Wisp', () => {
  const socket = makeSocket();
  let called = false;
  const result = handleWispUpgrade(request('/other/'), socket, Buffer.alloc(0), {
    wisp: { routeRequest() { called = true; } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession
  });
  assert.equal(result, 'ignored');
  assert.equal(socket.ended, true);
  assert.equal(called, false);
});

test('Wisp upgrade returns a flushed 403 for foreign origins', () => {
  const socket = makeSocket();
  const result = handleWispUpgrade(request('/wisp/', 'https://attacker.example'), socket, Buffer.alloc(0), {
    wisp: { routeRequest() { assert.fail('must not route'); } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession
  });
  assert.equal(result, 'forbidden');
  assert.match(socket.response, /^HTTP\/1\.1 403 Forbidden/);
  assert.match(socket.response, /Origin not allowed/);
});

test('Wisp upgrade returns a flushed 401 without a session', () => {
  const socket = makeSocket();
  const result = handleWispUpgrade(request(), socket, Buffer.alloc(0), {
    wisp: { routeRequest() { assert.fail('must not route'); } },
    isSameOrigin: sameOrigin,
    hasValidSession: () => false
  });
  assert.equal(result, 'unauthorized');
  assert.match(socket.response, /^HTTP\/1\.1 401 Unauthorized/);
  assert.match(socket.response, /Authentication required/);
});

test('Wisp synchronous routing exceptions destroy the socket and report the error', () => {
  const socket = makeSocket();
  const errors = [];
  const result = handleWispUpgrade(request(), socket, Buffer.alloc(0), {
    wisp: { routeRequest() { throw new Error('route failed'); } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession,
    onError: (error) => errors.push(error.message)
  });
  assert.equal(result, 'failed');
  assert.equal(socket.destroyed, true);
  assert.deepEqual(errors, ['route failed']);
});

test('Wisp asynchronous routing rejections are handled', async () => {
  const socket = makeSocket();
  const errors = [];
  const result = handleWispUpgrade(request(), socket, Buffer.alloc(0), {
    wisp: { routeRequest: async () => { throw new Error('async route failed'); } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession,
    onError: (error) => errors.push(error.message)
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result, 'routed');
  assert.equal(socket.destroyed, true);
  assert.deepEqual(errors, ['async route failed']);
});


test('Wisp upgrade rejects non-WebSocket requests on the Wisp path', () => {
  const req = request();
  req.headers.upgrade = 'h2c';
  const socket = makeSocket();
  const result = handleWispUpgrade(req, socket, Buffer.alloc(0), {
    wisp: { routeRequest() { assert.fail('must not route'); } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession
  });
  assert.equal(result, 'bad-request');
  assert.match(socket.response, /^HTTP\/1\.1 400 Bad Request/);
});

test('Wisp upgrade rejects a request without Connection: upgrade', () => {
  const req = request();
  req.headers.connection = 'keep-alive';
  const socket = makeSocket();
  const result = handleWispUpgrade(req, socket, Buffer.alloc(0), {
    wisp: { routeRequest() { assert.fail('must not route'); } },
    isSameOrigin: sameOrigin,
    hasValidSession: validSession
  });
  assert.equal(result, 'bad-request');
  assert.match(socket.response, /^HTTP\/1\.1 400 Bad Request/);
});
