import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import * as libcurl from '@mercuryworkshop/libcurl-transport';
import * as epoxy from '@mercuryworkshop/epoxy-transport';
import { createLoginLimiter, createSessionToken, isSameOriginRequest, parseCookies, SESSION_COOKIE, SESSION_TTL_SECONDS, safeEqualText, verifySessionToken } from './src/security.js';
import { handleWispUpgrade } from './src/wisp-upgrade.js';

const BUILD_ID = 'portal-20261030-13';
const app = express();
const server = createServer(app);
const publicPath = fileURLToPath(new URL('./public', import.meta.url));
const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const accessPassword = process.env.PORTAL_ACCESS_PASSWORD || '';
const authEnabled = accessPassword.length > 0;

if (onRender && accessPassword.length < 20) {
  console.error('PORTAL_ACCESS_PASSWORD is required on Render and must be at least 20 characters. Add it in Render → Environment, then redeploy.');
  process.exit(1);
}
if (authEnabled && accessPassword.length < 20) {
  console.error('PORTAL_ACCESS_PASSWORD must contain at least 20 characters.');
  process.exit(1);
}

const sessionSecret = process.env.PORTAL_SESSION_SECRET || (onRender ? '' : `${accessPassword}:${process.env.RENDER_SERVICE_ID || 'portal-local-session'}:local-development-session-secret`);
if (onRender && sessionSecret.length < 32) {
  console.error('PORTAL_SESSION_SECRET is required on Render and must contain at least 32 characters. Add it in Render → Environment, then redeploy.');
  process.exit(1);
}
if (sessionSecret.length < 32) {
  console.error('PORTAL_SESSION_SECRET must contain at least 32 characters.');
  process.exit(1);
}
const loginLimiter = createLoginLimiter({ limit: 8, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 });

// Wisp is a general-purpose transport, so do not expose it as an unauthenticated
// public relay. The session cookie and same-origin check are enforced on upgrade.
Object.assign(wisp.options, {
  allow_tcp_streams: true,
  allow_udp_streams: false,
  allow_direct_ip: false,
  allow_private_ips: false,
  allow_loopback_ips: false,
  port_whitelist: [80, 443],
  stream_limit_total: 80,
  stream_limit_per_host: 12,
  hostname_blacklist: [
    /^localhost$/i,
    /\.localhost$/i,
    /\.local$/i,
    /\.internal$/i,
    /\.lan$/i,
    /\.home$/i,
    /^metadata\.google\.internal$/i
  ]
});

// Trust the Render edge proxy only in Render. Local development binds to
// loopback, so it does not need (and should not trust) forwarded headers.
app.set('trust proxy', onRender ? 1 : false);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Portal-Build', BUILD_ID);
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path === '/' || req.path === '/index.html' || req.path === '/app.js' || req.path === '/sw.js' || req.path.startsWith('/scram/') || req.path.startsWith('/baremux/') || req.path.startsWith('/libcurl/') || req.path.startsWith('/epoxy/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.json({ limit: '8kb', strict: true }));

function sessionCookie(req, token) {
  const secure = Boolean(req.secure);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}
function clearSessionCookie(req) {
  const secure = Boolean(req.secure);
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
}
function isSameOrigin(req) {
  // Express requests expose .get(); raw Node upgrade requests only expose headers.
  const origin = typeof req.get === 'function' ? req.get('origin') : req.headers?.origin;
  const host = typeof req.get === 'function' ? req.get('host') : req.headers?.host;
  return isSameOriginRequest(origin, host);
}
function hasValidSession(req) {
  if (!authEnabled) return true;
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  return verifySessionToken(token, sessionSecret);
}
function sendUnauthorized(req, res) {
  if (req.path.startsWith('/api/') || req.path.startsWith('/__portal/')) {
    return res.status(401).json({ ok: false, error: 'Sign in to use Portal.' });
  }
  return res.redirect(302, '/login');
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'portal-browser', build: BUILD_ID, authEnabled, nodeMajor: Number(process.versions.node.split('.')[0]) });
});
app.get('/login', (_req, res) => {
  if (hasValidSession(_req)) return res.redirect('/');
  res.sendFile(join(publicPath, 'login.html'));
});
app.post('/api/login', (req, res) => {
  if (!isSameOrigin(req)) return res.status(403).json({ ok: false, error: 'Cross-origin login requests are not allowed.' });
  if (!authEnabled) return res.json({ ok: true, authEnabled: false });
  const key = String(req.ip || req.socket.remoteAddress || 'unknown');
  const quota = loginLimiter.check(key);
  if (!quota.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(quota.retryAfterMs / 1000))));
    return res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
  }
  const submitted = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqualText(submitted, accessPassword)) {
    loginLimiter.fail(key);
    return res.status(401).json({ ok: false, error: 'That password did not match.' });
  }
  loginLimiter.success(key);
  res.setHeader('Set-Cookie', sessionCookie(req, createSessionToken(sessionSecret)));
  return res.json({ ok: true, authEnabled: true });
});
app.post('/api/logout', (req, res) => {
  if (!isSameOrigin(req)) return res.status(403).json({ ok: false });
  res.setHeader('Set-Cookie', clearSessionCookie(req));
  res.json({ ok: true });
});
app.get('/api/session', (req, res) => res.json({ ok: true, authEnabled, signedIn: hasValidSession(req) }));

app.use((req, res, next) => {
  if (req.path === '/healthz' || req.path === '/login' || req.path === '/api/login' || req.path === '/api/logout' || req.path === '/api/session') return next();
  if (!hasValidSession(req)) return sendUnauthorized(req, res);
  next();
});

async function fileExists(base, name) {
  if (!base) return false;
  try { await access(join(base, name)); return true; }
  catch { return false; }
}
app.get('/__portal/diagnostics', async (_req, res) => {
  const [scramjetAll, scramjetWasm, scramjetSync, baremuxWorker, baremuxIndex, libcurlEntry, epoxyEntry, settingsCoreEntry, tabCoreEntry] = await Promise.all([
    fileExists(scramjetPath, 'scramjet.all.js'),
    fileExists(scramjetPath, 'scramjet.wasm.wasm'),
    fileExists(scramjetPath, 'scramjet.sync.js'),
    fileExists(baremuxPath, 'worker.js'),
    fileExists(baremuxPath, 'index.js'),
    fileExists(libcurl.libcurlPath, 'index.mjs'),
    fileExists(epoxy.epoxyPath, 'index.mjs'),
    fileExists(publicPath, 'settings-core.js'),
    fileExists(publicPath, 'tab-core.js')
  ]);
  const assets = { scramjetAll, scramjetWasm, scramjetSync, baremuxWorker, baremuxIndex, libcurlEntry, epoxyEntry, settingsCoreEntry, tabCoreEntry };
  const required = [scramjetAll, scramjetWasm, scramjetSync, baremuxWorker, baremuxIndex, libcurlEntry, epoxyEntry, settingsCoreEntry, tabCoreEntry];
  const ok = required.every(Boolean);
  res.status(ok ? 200 : 503).json({ ok, service: 'portal-browser', build: BUILD_ID, node: process.version, authEnabled, transportGenerations: { scramjet: '1.1.0', bareMux: '2.1.9', libcurl: '1.5.2', epoxy: '2.1.28', wisp: '0.4.1' }, wispPolicy: { tcp: true, udp: false, destinationPorts: [80, 443], privateNetworks: false, loopback: false }, assets });
});

app.use('/scram/', express.static(scramjetPath, { fallthrough: false, index: false, etag: false, maxAge: 0 }));
app.use('/baremux/', express.static(baremuxPath, { fallthrough: false, index: false, etag: false, maxAge: 0 }));
if (libcurl.libcurlPath) app.use('/libcurl/', express.static(libcurl.libcurlPath, { fallthrough: false, index: false, etag: false, maxAge: 0 }));
if (epoxy.epoxyPath) app.use('/epoxy/', express.static(epoxy.epoxyPath, { fallthrough: false, index: false, etag: false, maxAge: 0 }));
app.use(express.static(publicPath, { index: 'index.html', etag: false, maxAge: 0 }));
app.use((_req, res) => res.status(404).type('text/plain').send('Not found'));

server.on('upgrade', (req, socket, head) => {
  handleWispUpgrade(req, socket, head, {
    wisp,
    isSameOrigin,
    hasValidSession,
    onError: (error) => console.error('Wisp upgrade failed:', error)
  });
});

const port = Number.parseInt(process.env.PORT || '', 10) || 8080;
const listenHost = onRender ? '0.0.0.0' : '127.0.0.1';
server.listen(port, listenHost, () => {
  console.log(`Portal ${BUILD_ID} listening on ${listenHost}:${port}`);
  console.log(`Access password: ${authEnabled ? 'enabled' : 'disabled (local development only)'}`);
  console.log(`Proxy transports: libcurl=${Boolean(libcurl.libcurlPath)} epoxy=${Boolean(epoxy.epoxyPath)}`);
});

function shutdown() {
  console.log('Shutting down Portal Browser...');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 8000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
