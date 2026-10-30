import * as securityExports from '../src/security.js';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const syntaxFiles = ['server.js', 'src/security.js', 'src/wisp-upgrade.js', 'public/sw.js', 'public/settings-core.js', 'public/tab-core.js', 'public/app.js', 'scripts/preflight.mjs'];
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `${file}: syntax check failed\n`);
    process.exit(result.status || 1);
  }
  console.log(`PASS syntax: ${file}`);
}

const html = readFileSync('public/index.html', 'utf8');
const appJs = readFileSync('public/app.js', 'utf8');
const worker = readFileSync('public/sw.js', 'utf8');
const server = readFileSync('server.js', 'utf8');
const security = readFileSync('src/security.js', 'utf8');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const render = readFileSync('render.yaml', 'utf8');


const htmlIds = [...html.matchAll(/\bid\s*=\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
const uniqueHtmlIds = new Set(htmlIds);
if (uniqueHtmlIds.size !== htmlIds.length) throw new Error('public/index.html contains duplicate element IDs.');
const usedIds = [...new Set([...appJs.matchAll(/\$\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]))];
const missingIds = usedIds.filter((id) => !uniqueHtmlIds.has(id));
if (missingIds.length) throw new Error(`app.js references missing HTML IDs: ${missingIds.join(', ')}`);
console.log(`PASS HTML selector audit: ${usedIds.length} JavaScript IDs exist; ${htmlIds.length} unique HTML IDs; no duplicates`);

const loginHtml = readFileSync('public/login.html', 'utf8');
const inlineScripts = [...loginHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((script) => script.trim());
const tempDir = mkdtempSync(join(tmpdir(), 'portal-login-check-'));
try {
  inlineScripts.forEach((script, index) => {
    const scriptPath = join(tempDir, `login-${index}.js`);
    writeFileSync(scriptPath, script);
    const result = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || 'Login inline script syntax check failed.');
  });
} finally { rmSync(tempDir, { recursive: true, force: true }); }
console.log(`PASS login inline JavaScript syntax: ${inlineScripts.length} script(s)`);

const requiredFiles = [
  'public/index.html', 'public/app.js', 'public/settings-core.js', 'public/tab-core.js', 'public/sw.js', 'public/login.html',
  'package.json', 'server.js', 'src/security.js', 'src/wisp-upgrade.js', 'tests/security.test.mjs', 'tests/wisp-upgrade.test.mjs', 'tests/settings-core.test.mjs', 'tests/tab-core.test.mjs',
  'scripts/check.mjs', 'scripts/preflight.mjs', 'render.yaml', '.node-version', '.env.example',
  'README.txt', 'README.md', 'SETUP.md', 'RENDER-DEPLOYMENT.md', 'SECURITY.md', 'ENGINEERING-AUDIT.md', 'TEST-RESULTS.md', 'UPLOAD-TO-GITHUB.txt'
];
for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Missing project file: ${file}`);
  console.log(`PASS file: ${file}`);
}

if (pkg.scripts?.start !== 'node --env-file-if-exists=.env server.js') throw new Error('Start command must load an optional local .env file and run server.js');
if (pkg.scripts?.prestart !== 'node scripts/preflight.mjs') throw new Error('npm start must run the package preflight before server.js');
if (!pkg.scripts?.test?.includes('node --test')) throw new Error('npm test must run the Node test suite');
if (pkg.dependencies?.['@mercuryworkshop/scramjet'] !== '1.1.0') throw new Error('Scramjet must remain pinned to the published v1.1.0 npm package compatible with this app code');
if (pkg.dependencies?.['@mercuryworkshop/bare-mux'] !== '2.1.9') throw new Error('BareMux must remain on the v2.1.9 API used by this project');
if (pkg.dependencies?.['@mercuryworkshop/libcurl-transport'] !== '1.5.2') throw new Error('Libcurl transport must remain on v1.x with the BareMux integration');
if (pkg.dependencies?.['@mercuryworkshop/epoxy-transport'] !== '2.1.28') throw new Error('Epoxy transport must remain on v2.x with the BareMux integration');
if (pkg.dependencies?.['@mercuryworkshop/wisp-js'] !== '0.4.1') throw new Error('Wisp server package must be pinned to the tested Wisp API generation');
if (!pkg.dependencies?.express || !pkg.dependencies?.['@mercuryworkshop/wisp-js']) throw new Error('Express and Wisp server dependencies are required');
const preflight = readFileSync('scripts/preflight.mjs', 'utf8');
if (preflight.includes("load('@mercuryworkshop/bare-mux')")) throw new Error('Do not import the browser-only BareMux client module in Node preflight.');
if (!preflight.includes('BareMuxConnection') || !preflight.includes('browser bundle marker') || !preflight.includes('public/settings-core.js') || !preflight.includes('public/tab-core.js')) throw new Error('Preflight must inspect the served BareMux browser bundle marker.');
if (!server.includes('baremuxIndex, libcurlEntry, epoxyEntry, settingsCoreEntry, tabCoreEntry')) throw new Error('Proxy diagnostics must require both configured transports to be present.');
if (pkg.engines?.node !== '>=22.9 <23') throw new Error('Node engine range must support Node 22 env-file-if-exists and stay below Node 23');
console.log('PASS package metadata and compatible Scramjet 1 / BareMux 2 transport generation');

for (const id of [
  'settings-btn', 'settings-backdrop', 'duplicate-tab', 'reopen-tab', 'stop',
  'theme-select', 'motion-toggle', 'history-toggle', 'restore-toggle', 'max-tabs-select', 'compact-tabs-toggle',
  'engine-select', 'transport-select', 'autoplay-toggle', 'clipboard-toggle',
  'fullscreen-toggle', 'clear-history-setting', 'clear-bookmarks-setting',
  'export-bookmarks', 'export-history', 'import-bookmarks', 'bookmark-file', 'forget-data',
  'logout', 'run-diagnostics', 'test-wisp', 'copy-diagnostics', 'diag-output',
  'export-settings', 'import-settings', 'settings-file', 'reset-settings'
]) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing UI control: ${id}`);
}
for (const section of ['general', 'appearance', 'search', 'tabs', 'privacy', 'permissions', 'connection', 'advanced', 'diagnostics', 'about']) {
  if (!html.includes(`data-settings-tab="${section}"`) || !html.includes(`data-settings-section="${section}"`)) {
    throw new Error(`Settings section ${section} is incomplete`);
  }
}
const settingsNavButtons = [...html.matchAll(/<button\b([^>]*data-settings-tab=\"[^\"]+\"[^>]*)>/g)].map((match) => match[1]);
if (settingsNavButtons.length !== 10 || settingsNavButtons.some((attrs) => !/\baria-label=\"[^\"]+\"/.test(attrs) || !/\btitle=\"[^\"]+\"/.test(attrs))) throw new Error('All settings navigation buttons must have accessible names and mobile tooltips');
console.log('PASS accessible names and mobile tooltips for all ten settings navigation buttons');
if (!appJs.includes("from './tab-core.js'") || !appJs.includes('reorderTabsWithinGroup') || !appJs.includes('setTabPinOrder')) throw new Error('Browser tab core module is not imported.');
if (!appJs.includes('normalizeSettings') || !appJs.includes('ALLOWED_MAX_TABS') || !appJs.includes('normalizePortalSettings')) throw new Error('Settings must be normalized and tab limits must be constrained.');
if (!appJs.includes('settings.maxTabs') || !appJs.includes('compact-tabs') || !appJs.includes('function moveTab') || !appJs.includes('function setTabPinned') || !appJs.includes('tab.el.draggable = true')) throw new Error('Tab limit and compact-tab settings must affect actual UI behavior.');
if (!appJs.includes('exportSettings') || !appJs.includes('importSettings') || !appJs.includes('resetSettings') || !appJs.includes('validateSettingsBackup')) throw new Error('Advanced settings import/export/reset actions are incomplete.');
if (!appJs.includes('validateSettingsBackup(parsed)') || !appJs.includes('file.size > 1024 * 1024')) throw new Error('Settings import must validate format and file size.');
if (!html.includes('id="tab-context-menu"') || !html.includes('data-tab-action="others"') || !html.includes('data-tab-action="pin"')) throw new Error('Custom tab context menu is missing');
if (html.includes('class="quick"') || /YouTube|Reddit|Wikipedia/.test(html)) throw new Error('Preset auto-recommendation links must not be present');
if (!html.includes('id="bq"') || !html.includes('role="search"')) throw new Error('Address/search bar is missing');
if (!html.includes('type="module" src="/app.js?build=portal-20261030-13"')) throw new Error('HTML does not load the v13 application script');
if (!appJs.includes("const BUILD_ID = 'portal-20261030-13'")) throw new Error('App script build identifier is wrong');
if (!appJs.includes('scramjet.createFrame()') || !appJs.includes('tab.scramFrame.go(url)')) throw new Error('Scramjet managed frame API is missing');
if (!appJs.includes('connection.setTransport(path, options)')) throw new Error('BareMux transport must be configured before the service worker');
if (!appJs.includes('tab.navigationRequestId') || !appJs.includes('tabs.includes(tab)')) throw new Error('Navigation race/closed-tab protection is missing');
if (!appJs.includes('const placeholder = document.createElement(\'iframe\')')) throw new Error('Home must replace the managed iframe with a clean placeholder');
if (!appJs.includes('withTimeout(controller.init()')) throw new Error('Scramjet initialization timeout is missing');
if (!appJs.includes('if (!scramjet)') || !appJs.includes('if (!connection)')) throw new Error('Proxy retry must reuse initialized Scramjet and BareMux instances');
if (!appJs.includes("const queryPreference = new URLSearchParams(location.search).get('transport')")) throw new Error('Transport selection must validate URL overrides and preserve Auto fallback');
if (!appJs.includes('if (error) target.remove()')) throw new Error('Failed proxy scripts must be removed so a retry can fetch them again');
if (!appJs.includes("key === 't'")) throw new Error('Keyboard shortcuts are missing');
if (!html.includes('id="settings-file"') || !html.includes('id="max-tabs-select"') || !html.includes('id="compact-tabs-toggle"')) throw new Error('Settings import or tab controls are missing.');
console.log('PASS ten settings sections, import/export, pinned/reorderable tabs, and navigation lifecycle');

if (worker.includes('indexedDB.deleteDatabase') || worker.includes('indexedDB.databases') || worker.includes('openIDB')) throw new Error('Service worker must not manipulate Scramjet IndexedDB');
if (!worker.includes("requestUrl.pathname.startsWith(SCRAMJET_PREFIX)")) throw new Error('Service worker must only intercept proxied-page paths');
if (!worker.includes('scramjet.loadConfig()') || !worker.includes('scramjet.fetch(event)')) throw new Error('Scramjet request path is incomplete');
if (!appJs.includes("from './settings-core.js'") || !html.includes('type="module"')) throw new Error('Browser settings module is not loaded as an ES module.');
if (!worker.includes('portal-20261030-13')) throw new Error('Service worker build identifier is wrong');
console.log('PASS conservative service-worker routing and Scramjet-managed storage');

const securityImport = server.match(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/src\/security\.js['"]/s);
if (!securityImport) throw new Error('Could not find server.js security imports');
for (const imported of securityImport[1].split(',').map((part) => part.trim()).filter(Boolean)) {
  const [exportedName] = imported.split(/\s+as\s+/);
  if (!Object.hasOwn(securityExports, exportedName)) throw new Error(`server.js imports missing security export: ${exportedName}`);
}
if (!security.includes('parsed.protocol === \'https:\' || parsed.protocol === \'http:\'')) throw new Error('Same-origin check must reject non-HTTP origins');
if (!security.includes('if (typeof origin !== \'string\' || !origin')) throw new Error('Same-origin check must fail closed when Origin is missing');
console.log('PASS server.js local imports and fail-closed Origin validation');

if (!server.includes('PORTAL_ACCESS_PASSWORD') || !server.includes('PORTAL_SESSION_SECRET') || !server.includes('verifySessionToken')) throw new Error('Hosted session authentication is missing');
if (!server.includes('handleWispUpgrade(req, socket, head')) throw new Error('Wisp WebSocket requests must pass through the independently tested upgrade handler');
const upgrade = readFileSync('src/wisp-upgrade.js', 'utf8');
if (!upgrade.includes('req.url = parsed.pathname') || !upgrade.includes('socket.end(`${response}\\r\\n`)')) throw new Error('Wisp upgrade path normalization and flushed HTTP rejections are missing');
if (!server.includes('const secure = Boolean(req.secure)')) throw new Error('Session Secure cookies must rely on Express trusted-proxy TLS detection, not an arbitrary forwarded header.');
if (!server.includes('allow_private_ips: false') || !server.includes('allow_loopback_ips: false') || !server.includes('allow_udp_streams: false')) throw new Error('Wisp network safety defaults are missing');
if (!server.includes('port_whitelist: [80, 443]')) throw new Error('Wisp destination port allowlist is missing');
if (!server.includes('settingsCoreEntry') || !server.includes('/__portal/diagnostics') || !server.includes("'/healthz'")) throw new Error('Health and diagnostics endpoints are missing');
if (!server.includes("const BUILD_ID = 'portal-20261030-13'")) throw new Error('Server build identifier is wrong');
console.log('PASS protected Wisp endpoint, destination policy, and diagnostics');

const login = readFileSync('public/login.html', 'utf8');
if (!login.includes('/api/login') || !login.includes('autocomplete="current-password"')) throw new Error('Private sign-in page is incomplete');
if (login.includes('YOUR_PASSWORD')) throw new Error('Do not ship a hard-coded password');
if (!render.includes('PORTAL_ACCESS_PASSWORD') || !render.includes('PORTAL_SESSION_SECRET') || !render.includes('generateValue: true') || !render.includes('healthCheckPath: /healthz')) throw new Error('Render Blueprint must define both secrets and a health check');
if (!render.includes('name: portal-browser-v13')) throw new Error('Render Blueprint must identify this as the v13 service.');
if (!render.includes('buildCommand: npm install && npm test && npm run preflight') || !render.includes('startCommand: npm start')) throw new Error('Render must install dependencies, run tests, and verify real package exports/assets before deploying');
if (readFileSync('.node-version', 'utf8').trim() !== '22') throw new Error('Node version must be pinned to 22');
console.log('PASS private sign-in and new-service Render configuration');

if (!server.includes("const listenHost = onRender ? '0.0.0.0' : '127.0.0.1'")) throw new Error('Local unauthenticated development must bind to loopback only');
for (const file of ['server.js', 'public/app.js', 'public/sw.js', 'public/index.html']) {
  const content = readFileSync(file, 'utf8');
  if (content.includes('portal-20261030-10')) throw new Error(`Old v10 build identifier remains in ${file}`);
  if (!content.includes('portal-20261030-13')) throw new Error(`v13 build identifier missing from ${file}`);
}
console.log('PASS matching v13 build identifier and safe local binding across server, app, HTML, and service worker');
