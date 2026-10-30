// Portal Browser v10 service worker. Scramjet manages its own IndexedDB schema;
// Portal deliberately does not inspect, delete, or close Scramjet databases.
importScripts('/scram/scramjet.all.js?build=portal-20261030-13');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const SCRAMJET_PREFIX = '/~/sj/';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  // Portal shell, BareMux, WASM, and transport files must bypass Scramjet.
  if (!requestUrl.pathname.startsWith(SCRAMJET_PREFIX)) return;

  event.respondWith((async () => {
    try {
      await scramjet.loadConfig();
      if (scramjet.route(event)) return await scramjet.fetch(event);
      return await fetch(event.request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const details = { name: error?.name || 'Error', message, url: event.request.url };
      console.error('Portal Scramjet request failed:', details);
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: 'PORTAL_SCRAMJET_ERROR', details });
      return new Response(`Portal proxy request failed: ${message}`, {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }
  })());
});
