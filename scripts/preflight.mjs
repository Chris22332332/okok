import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const failures = [];

async function load(name) {
  try {
    const value = await import(name);
    console.log(`PASS package import: ${name}`);
    return value;
  } catch (error) {
    failures.push(`Cannot import ${name}: ${error.message}`);
    return null;
  }
}

const [express, wispModule, scramjetModule, baremuxModule, libcurl, epoxy, security] = await Promise.all([
  load('express'),
  load('@mercuryworkshop/wisp-js/server'),
  load('@mercuryworkshop/scramjet/path'),
  load('@mercuryworkshop/bare-mux/node'),
  load('@mercuryworkshop/libcurl-transport'),
  load('@mercuryworkshop/epoxy-transport'),
  import('../src/security.js').catch((error) => {
    failures.push(`Cannot import ./src/security.js: ${error.message}`);
    return null;
  })
]);

if (express && typeof express.default !== 'function') failures.push('express does not expose its default application factory.');
if (wispModule && (typeof wispModule.server?.routeRequest !== 'function' || !wispModule.server?.options || typeof wispModule.server.options !== 'object')) {
  failures.push('@mercuryworkshop/wisp-js/server must export server.routeRequest() and server.options.');
}
if (scramjetModule && (typeof scramjetModule.scramjetPath !== 'string' || !scramjetModule.scramjetPath)) {
  failures.push('@mercuryworkshop/scramjet/path must export scramjetPath.');
}
if (baremuxModule && (typeof baremuxModule.baremuxPath !== 'string' || !baremuxModule.baremuxPath)) {
  failures.push('@mercuryworkshop/bare-mux/node must export baremuxPath.');
}
if (libcurl && (typeof libcurl.libcurlPath !== 'string' || !libcurl.libcurlPath)) {
  failures.push('@mercuryworkshop/libcurl-transport v1 must export libcurlPath. Do not install libcurl v2 with this BareMux/Scramjet v1 stack.');
}
if (epoxy && (typeof epoxy.epoxyPath !== 'string' || !epoxy.epoxyPath)) {
  failures.push('@mercuryworkshop/epoxy-transport v2 must export epoxyPath. Do not install epoxy v3 with this BareMux/Scramjet v1 stack.');
}
if (security && typeof security.createLoginLimiter !== 'function') {
  failures.push('./src/security.js must export createLoginLimiter().');
}

const localBrowserFiles = ['public/settings-core.js', 'public/tab-core.js', 'public/app.js', 'public/sw.js', 'public/index.html', 'public/login.html'];
for (const file of localBrowserFiles) {
  if (existsSync(file)) console.log(`PASS browser asset: ${file}`);
  else failures.push(`Missing browser asset: ${file}`);
}

const paths = [
  ['Scramjet controller bundle', scramjetModule?.scramjetPath, 'scramjet.all.js'],
  ['Scramjet WebAssembly', scramjetModule?.scramjetPath, 'scramjet.wasm.wasm'],
  ['Scramjet sync runtime', scramjetModule?.scramjetPath, 'scramjet.sync.js'],
  ['BareMux SharedWorker', baremuxModule?.baremuxPath, 'worker.js'],
  ['BareMux browser entry', baremuxModule?.baremuxPath, 'index.js'],
  ['Libcurl browser transport', libcurl?.libcurlPath, 'index.mjs'],
  ['Epoxy browser transport', epoxy?.epoxyPath, 'index.mjs']
];
for (const [label, base, file] of paths) {
  if (!base) continue;
  const candidate = resolve(join(base, file));
  if (existsSync(candidate)) console.log(`PASS asset: ${label}`);
  else failures.push(`Missing ${label}: ${candidate}`);
}

// BareMux's browser entry captures browser globals at module evaluation time.
// Do not import it in Node preflight; inspect the served browser bundle instead.
if (baremuxModule?.baremuxPath) {
  const browserEntry = resolve(join(baremuxModule.baremuxPath, 'index.js'));
  if (existsSync(browserEntry)) {
    const source = readFileSync(browserEntry, 'utf8');
    if (source.includes('BareMuxConnection')) console.log('PASS browser API marker: BareMuxConnection');
    else failures.push(`BareMux browser bundle does not contain BareMuxConnection: ${browserEntry}`);
  }
}

if (failures.length) {
  console.error('\nPORTAL DEPLOYMENT PREFLIGHT FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('\nCheck package versions, repository root, and Render build output. Do not mix Scramjet 1.x/BareMux with Scramjet 2.x transport packages.');
  process.exit(1);
}

console.log('\nPORTAL DEPLOYMENT PREFLIGHT PASSED');
console.log('All server-side package exports, BareMux browser bundle marker, local browser modules, and transport assets required by this build are present.');
