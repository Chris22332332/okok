import { normalizePortalSettings, validateSettingsBackup } from './settings-core.js';
import { reorderTabsWithinGroup, setTabPinOrder } from './tab-core.js';

'use strict';

const $ = (id) => document.getElementById(id);
const BUILD_ID = 'portal-20261030-13';
const DEFAULT_MAX_TABS = 16;
const ALLOWED_MAX_TABS = [8, 12, 16, 24];
const SCRIPT_TIMEOUT_MS = 20000;
const PROXY_INIT_TIMEOUT_MS = 35000;
const KEYS = {
  settings: 'portal-ui-settings-v8',
  bookmarks: 'portal-bookmarks-v1',
  history: 'portal-history-v1',
  session: 'portal-session-v1'
};
const defaults = {
  theme: 'aurora', animations: true, saveHistory: true, restoreSession: true,
  searchEngine: 'duckduckgo', transport: 'auto', allowAutoplay: false,
  allowClipboard: false, allowFullscreen: true, maxTabs: DEFAULT_MAX_TABS, compactTabs: false
};
const engines = {
  duckduckgo: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
  brave: (query) => `https://search.brave.com/search?q=${encodeURIComponent(query)}`,
  google: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  bing: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`
};
const readJSON = (key, fallback) => {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
};
const writeJSON = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.warn('Portal could not save local data:', error); }
};
const normalizeSettings = (value) => normalizePortalSettings(value, defaults, Object.keys(engines), ALLOWED_MAX_TABS);
const storedSettings = readJSON(KEYS.settings, {});
let settings = normalizeSettings(storedSettings);
let tabs = [];
let active = null;
let closedTabs = [];
let contextTab = null;
let scramjet = null;
let connection = null;
let serviceWorkerRegistration = null;
let setupPromise = null;
let currentTransport = null;

function say(message, duration = 5500) {
  const element = $('msg');
  element.textContent = message;
  element.style.display = 'block';
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { element.style.display = 'none'; }, duration);
}
function setProxyStatus(state, message) {
  const pill = $('proxy-pill');
  pill.classList.toggle('connecting', state === 'connecting');
  pill.classList.toggle('error', state === 'error');
  $('proxy-pill-text').textContent = message;
  $('status-dot').style.background = state === 'error' ? 'var(--bad)' : state === 'connecting' ? 'var(--warn)' : 'var(--good)';
  if (state === 'error') $('status-left').textContent = 'Connection needs attention';
}
function getBookmarks() {
  const value = readJSON(KEYS.bookmarks, []);
  return Array.isArray(value) ? value.filter((item) => item && typeof item.url === 'string') : [];
}
function getHistory() {
  const value = readJSON(KEYS.history, []);
  return Array.isArray(value) ? value.filter((item) => item && typeof item.url === 'string') : [];
}
function saveSettings() { writeJSON(KEYS.settings, settings); }
function toUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (/^(javascript|data|file|vbscript):/i.test(input)) {
    say('That address type is not supported. Enter an HTTPS or HTTP website instead.');
    return '';
  }
  if (/^https?:\/\//i.test(input)) {
    try { const url = new URL(input); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  if (/^(localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d{1,5})?(?:[/?#][^\s]*)?$/i.test(input) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d{1,5})?(?:[/?#][^\s]*)?$/.test(input)) {
    return `https://${input}`;
  }
  return (engines[settings.searchEngine] || engines.duckduckgo)(input);
}
function hostOf(value) {
  try { return new URL(value).hostname.replace(/^www\./, ''); }
  catch { return value || 'New tab'; }
}
function applySettings() {
  document.documentElement.dataset.accent = settings.theme;
  document.body.classList.toggle('reduced-motion', !settings.animations);
  document.body.classList.toggle('compact-tabs', !!settings.compactTabs);
  $('theme-select').value = settings.theme;
  $('motion-toggle').checked = !!settings.animations;
  $('history-toggle').checked = !!settings.saveHistory;
  $('restore-toggle').checked = !!settings.restoreSession;
  $('engine-select').value = settings.searchEngine;
  $('transport-select').value = settings.transport;
  $('max-tabs-select').value = String(settings.maxTabs);
  $('compact-tabs-toggle').checked = !!settings.compactTabs;
  $('autoplay-toggle').checked = !!settings.allowAutoplay;
  $('clipboard-toggle').checked = !!settings.allowClipboard;
  $('fullscreen-toggle').checked = !!settings.allowFullscreen;
  $('status-transport').textContent = `TRANSPORT · ${(currentTransport || settings.transport).toUpperCase()}`;
  $('wisp-endpoint').textContent = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  $('build-label').textContent = BUILD_ID;
  tabs.forEach(applyFramePermissions);
}
function applyFramePermissions(tab) {
  if (!tab?.frame) return;
  const permissions = [];
  if (settings.allowAutoplay) permissions.push('autoplay');
  if (settings.allowClipboard) permissions.push('clipboard-read', 'clipboard-write');
  if (settings.allowFullscreen) permissions.push('fullscreen');
  permissions.push('picture-in-picture');
  tab.frame.setAttribute('allow', permissions.join('; '));
}
function saveSession() {
  if (!settings.restoreSession) return;
  const pages = tabs.map((tab) => tab.currentUrl || '').filter(Boolean).slice(-8);
  const pinnedUrls = tabs.filter((tab) => tab.pinned && tab.currentUrl).map((tab) => tab.currentUrl).filter((url) => pages.includes(url));
  writeJSON(KEYS.session, { pages, pinnedUrls, active: active ? Math.max(0, pages.indexOf(active.currentUrl)) : 0, savedAt: Date.now() });
}
function saveHistory(url, title) {
  if (!settings.saveHistory || !url) return;
  const list = getHistory().filter((item) => item.url !== url);
  list.unshift({ url, title: title || hostOf(url), time: Date.now() });
  writeJSON(KEYS.history, list.slice(0, 40));
  tabs.forEach(renderHome);
}
function renderHome(tab) {
  if (!tab?.view) return;
  const bookmarksTarget = tab.view.querySelector('[data-role="bookmarks"]');
  const historyTarget = tab.view.querySelector('[data-role="history"]');
  if (!bookmarksTarget || !historyTarget) return;
  bookmarksTarget.replaceChildren();
  const bookmarks = getBookmarks();
  if (!bookmarks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No bookmarks yet. Open a page and tap the bookmark icon to save it here.';
    bookmarksTarget.appendChild(empty);
  }
  bookmarks.slice(0, 12).forEach((item) => {
    const card = document.createElement('div'); card.className = 'bookmark-card';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'bookmark-open'; open.title = item.url;
    const icon = document.createElement('span'); icon.className = 'bookmark-icon'; icon.textContent = (item.title || hostOf(item.url)).slice(0, 1).toUpperCase();
    const name = document.createElement('span'); name.className = 'bookmark-name'; name.textContent = item.title || hostOf(item.url);
    open.append(icon, name); open.addEventListener('click', () => go(item.url, tab));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'bookmark-remove'; remove.textContent = '×'; remove.title = 'Remove bookmark'; remove.setAttribute('aria-label', 'Remove bookmark');
    remove.addEventListener('click', () => { writeJSON(KEYS.bookmarks, getBookmarks().filter((bookmark) => bookmark.url !== item.url)); tabs.forEach(renderHome); updateBookmarkButton(); });
    card.append(open, remove); bookmarksTarget.appendChild(card);
  });
  historyTarget.replaceChildren();
  const history = settings.saveHistory ? getHistory().slice(0, 8) : [];
  if (!history.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.textContent = settings.saveHistory ? 'Pages you visit will show up here.' : 'Recent pages are turned off in Settings.';
    historyTarget.appendChild(empty);
  }
  history.forEach((item) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'history-row';
    const icon = document.createElement('span'); icon.className = 'history-icon'; icon.textContent = '↗';
    const copy = document.createElement('span'); copy.className = 'history-copy';
    const title = document.createElement('strong'); title.textContent = item.title || hostOf(item.url);
    const host = document.createElement('small'); host.textContent = hostOf(item.url);
    copy.append(title, host); button.append(icon, copy); button.addEventListener('click', () => go(item.url, tab)); historyTarget.appendChild(button);
  });
}
function updateBookmarkButton() {
  const button = $('bookmark-page');
  const saved = !!(active?.currentUrl && getBookmarks().some((item) => item.url === active.currentUrl));
  button.setAttribute('aria-pressed', String(saved));
  button.classList.toggle('active', saved);
  button.title = saved ? 'Remove bookmark' : 'Bookmark this page';
}
function updateNavigationButtons() {
  if (!active) return;
  $('back').disabled = active.historyIndex <= 0;
  $('fwd').disabled = active.historyIndex < 0 || active.historyIndex >= active.history.length - 1;
  $('stop').disabled = !active.loading;
  $('reload').disabled = !active.currentUrl;
}
function select(tab) {
  if (!tab || !tabs.includes(tab)) return;
  active = tab;
  tabs.forEach((item) => {
    item.view.classList.toggle('on', item === tab);
    item.el.classList.toggle('on', item === tab);
    item.el.setAttribute('aria-selected', String(item === tab));
  });
  $('bq').value = tab.currentUrl || '';
  $('tab-count').textContent = `${tabs.length}${tabs.length === 1 ? ' TAB' : ' TABS'}`;
  $('status-left').textContent = tab.currentUrl ? hostOf(tab.currentUrl) : 'Portal is ready';
  updateBookmarkButton(); updateNavigationButtons();
  saveSession();
}
function setTabTitle(tab, title) {
  tab.title = title || (tab.currentUrl ? hostOf(tab.currentUrl) : 'New tab');
  tab.label.textContent = tab.loading ? 'Loading…' : tab.title;
  tab.el.setAttribute('aria-label', tab.title);
  tab.el.title = `${tab.pinned ? 'Pinned · ' : ''}${tab.title}`;
}
function attachFrameEvents(tab, frame) {
  frame.addEventListener('load', () => {
    if (tab.frame !== frame || !tabs.includes(tab)) return;
    try {
      const frameUrl = frame.contentWindow.location.href;
      if (frameUrl === 'about:blank' && tab.loading) return;
      if (scramjet && typeof scramjet.decodeUrl === 'function' && frameUrl.includes('/~/sj/')) tab.currentUrl = scramjet.decodeUrl(frameUrl);
      const frameDocument = frame.contentDocument;
      const frameTitle = frameDocument?.title;
      if (frameTitle) tab.title = frameTitle;
      const proxyError = frameDocument?.body?.innerText?.trim().match(/^Portal proxy request failed:\s*(.+)$/s);
      if (proxyError) {
        clearTimeout(tab.navigationTimer);
        tab.navigationTimer = null;
        tab.loading = false;
        tab.view.classList.remove('loading');
        if (active === tab) setProxyStatus('error', 'PROXY REQUEST FAILED');
        say(`Proxy request failed: ${proxyError[1]}`, 10000);
        updateNavigationButtons();
        return;
      }
    } catch { /* A cross-origin target may hide its document metadata. */ }
    clearTimeout(tab.navigationTimer);
    tab.navigationTimer = null;
    tab.loading = false;
    setTabTitle(tab, tab.title || hostOf(tab.currentUrl));
    if (tab.currentUrl) saveHistory(tab.currentUrl, tab.title);
    tab.view.classList.remove('loading');
    if (active === tab) {
      $('bq').value = tab.currentUrl || '';
      $('status-left').textContent = tab.currentUrl ? hostOf(tab.currentUrl) : 'Portal is ready';
      updateBookmarkButton();
      if (tab.currentUrl && currentTransport) setProxyStatus('ready', `PAGE LOADED · ${currentTransport.toUpperCase()}`);
    }
    updateNavigationButtons();
    saveSession();
  });
}
function closeTab(tab) {
  hideTabMenu();
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  closedTabs.unshift({ url: tab.currentUrl, title: tab.title, history: [...tab.history], historyIndex: tab.historyIndex });
  closedTabs = closedTabs.slice(0, 10);
  tab.navigationRequestId = (tab.navigationRequestId || 0) + 1;
  clearTimeout(tab.navigationTimer); tab.navigationTimer = null;
  try { tab.frame?.contentWindow?.stop(); } catch {}
  tabs.splice(index, 1); tab.el.remove(); tab.view.remove();
  if (!tabs.length) newTab();
  else if (active === tab) select(tabs[Math.max(0, index - 1)]);
  $('tab-count').textContent = `${tabs.length}${tabs.length === 1 ? ' TAB' : ' TABS'}`;
  saveSession();
}
function createTab(initialUrl = '') {
  const maxTabs = ALLOWED_MAX_TABS.includes(settings.maxTabs) ? settings.maxTabs : DEFAULT_MAX_TABS;
  if (tabs.length >= maxTabs) { say(`Portal supports up to ${maxTabs} open tabs in this workspace. Change the limit in Settings → Tabs.`); return null; }
  const tab = { currentUrl: '', title: 'New tab', history: [], historyIndex: -1, loading: false, pinned: false, scramFrame: null, frame: null, navigationRequestId: 0, navigationTimer: null };
  tab.view = $('tpl').content.firstElementChild.cloneNode(true);
  tab.frame = tab.view.querySelector('iframe');
  tab.el = document.createElement('div'); tab.el.className = 'tab'; tab.el.draggable = true; tab.el.setAttribute('role', 'tab'); tab.el.setAttribute('aria-selected', 'false');
  const symbol = document.createElement('span'); symbol.className = 'tab-symbol'; symbol.textContent = '✧'; tab.symbol = symbol;
  tab.label = document.createElement('span'); tab.label.className = 'tab-title'; tab.label.textContent = 'New tab';
  const close = document.createElement('button'); close.type = 'button'; close.className = 'tab-close'; close.textContent = '×'; close.title = 'Close tab'; close.setAttribute('aria-label', 'Close tab');
  tab.el.append(symbol, tab.label, close);
  tab.el.addEventListener('click', () => select(tab));
  tab.el.addEventListener('contextmenu', (event) => {
    event.preventDefault(); event.stopPropagation(); select(tab); showTabMenu(tab, event.clientX, event.clientY);
  });
  tab.el.addEventListener('dragstart', (event) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(tabs.indexOf(tab)));
    tab.el.classList.add('dragging');
  });
  tab.el.addEventListener('dragover', (event) => { event.preventDefault(); tab.el.classList.add('drag-over'); });
  tab.el.addEventListener('dragleave', () => tab.el.classList.remove('drag-over'));
  tab.el.addEventListener('drop', (event) => {
    event.preventDefault(); tab.el.classList.remove('drag-over');
    const sourceIndex = Number(event.dataTransfer.getData('text/plain'));
    const source = tabs[sourceIndex];
    const rect = tab.el.getBoundingClientRect();
    moveTab(source, tab, event.clientX > rect.left + rect.width / 2);
  });
  tab.el.addEventListener('dragend', () => { document.querySelectorAll('.tab').forEach((item) => item.classList.remove('dragging', 'drag-over')); });
  close.addEventListener('click', (event) => { event.stopPropagation(); closeTab(tab); });
  $('tabs').appendChild(tab.el); $('views').appendChild(tab.view);
  const homeInput = tab.view.querySelector('.hf input');
  tab.view.querySelector('.hf').addEventListener('submit', (event) => { event.preventDefault(); go(homeInput.value, tab); });
  tab.view.querySelector('[data-action="clear-history"]').addEventListener('click', clearHistory);
  tab.view.querySelector('[data-action="bookmark-info"]').addEventListener('click', () => say('Open a website, then use the bookmark icon in the top toolbar.'));
  attachFrameEvents(tab, tab.frame);
  tabs.push(tab); applyFramePermissions(tab); renderHome(tab); select(tab);
  if (initialUrl) void go(initialUrl, tab);
  else homeInput.focus();
  return tab;
}
function newTab() { return createTab(); }
function duplicateTab(tab = active) {
  if (!tab) return;
  const copy = createTab();
  if (copy) { if (tab.pinned) setTabPinned(copy, true, false); if (tab.currentUrl) void go(tab.currentUrl, copy); }
}
function reopenClosedTab() {
  const previous = closedTabs.shift();
  if (!previous) { say('There are no recently closed tabs.'); return; }
  const tab = createTab();
  if (tab && previous.url) void go(previous.url, tab);
}

function showTabMenu(tab, x, y) {
  contextTab = tab;
  const pinAction = $('tab-context-menu').querySelector('[data-tab-action="pin"]');
  pinAction.textContent = tab.pinned ? '◇ Unpin tab' : '◆ Pin tab';
  const menu = $('tab-context-menu');
  menu.classList.add('open');
  menu.style.left = `${Math.min(x, window.innerWidth - 205)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - 250)}px`;
}
function hideTabMenu() {
  $('tab-context-menu').classList.remove('open');
  contextTab = null;
}
function closeOtherTabs(keep) {
  tabs.filter((tab) => tab !== keep && !tab.pinned).slice().forEach(closeTab);
  if (tabs.includes(keep)) select(keep);
  hideTabMenu();
}
function renderTabOrder() {
  const container = $('tabs');
  tabs.forEach((tab) => container.appendChild(tab.el));
}
function setTabPinned(tab, pinned, notify = true) {
  if (!tab || !tabs.includes(tab)) return;
  tab.pinned = Boolean(pinned);
  tab.el.classList.toggle('pinned', tab.pinned);
  if (tab.symbol) tab.symbol.textContent = tab.pinned ? '◆' : '✧';
  tab.el.title = tab.pinned ? `Pinned tab: ${tab.title}` : tab.title;
  tabs = setTabPinOrder(tabs, tab, tab.pinned);
  renderTabOrder();
  saveSession();
  if (notify) say(tab.pinned ? 'Tab pinned.' : 'Tab unpinned.');
}
function moveTab(source, target, after = false) {
  if (!source || !target || source === target || !tabs.includes(source) || !tabs.includes(target)) return;
  if (source.pinned !== target.pinned) { say('Pinned tabs stay grouped at the start of the tab strip.'); return; }
  tabs = reorderTabsWithinGroup(tabs, source, target, after);
  renderTabOrder();
  saveSession();
}
async function copyCurrentAddress(tab = contextTab || active) {
  if (!tab?.currentUrl) { say('This tab does not have a page address yet.'); return; }
  try { await navigator.clipboard.writeText(tab.currentUrl); say('Page address copied.'); }
  catch { say('Clipboard access is unavailable in this browser context.'); }
}
function exportHistory() {
  const blob = new Blob([JSON.stringify({ format: 'portal-history', version: 1, history: getHistory() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'portal-history.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
}
function loadScript(src, readyCheck) {
  if (readyCheck()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let script = [...document.scripts].find((item) => item.dataset.portalSrc === src);
    if (script?.dataset.portalLoaded === 'true') {
      if (readyCheck()) return resolve();
      script.remove();
      script = null;
    }
    const target = script || document.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      target.removeEventListener('load', onLoad);
      target.removeEventListener('error', onError);
      // Remove failed script elements so a user retry can actually request the file again.
      if (error) target.remove();
      error ? reject(error) : resolve();
    };
    const onLoad = () => {
      target.dataset.portalLoaded = 'true';
      finish(readyCheck() ? null : new Error(`${src} loaded but did not expose the expected API.`));
    };
    const onError = () => finish(new Error(`Could not load required proxy file ${src}. Check the deployment diagnostics.`));
    const timer = setTimeout(() => finish(new Error(`Timed out loading ${src}.`)), SCRIPT_TIMEOUT_MS);
    target.addEventListener('load', onLoad, { once: true });
    target.addEventListener('error', onError, { once: true });
    if (!script) {
      target.src = src;
      target.async = true;
      target.dataset.portalSrc = src;
      document.head.appendChild(target);
    }
  });
}
async function checkAsset(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new Error(`Required proxy file is missing: ${path} (HTTP ${response.status}).`);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Timed out checking required proxy file ${path}.`);
    if (error.message?.startsWith('Required proxy file')) throw error;
    throw new Error(`Could not reach required proxy file ${path}: ${error.message}`);
  } finally { clearTimeout(timer); }
}
async function chooseTransport() {
  const wisp = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  const queryPreference = new URLSearchParams(location.search).get('transport');
  const requestedPreference = queryPreference || settings.transport;
  const preferred = ['auto', 'libcurl', 'epoxy'].includes(requestedPreference) ? requestedPreference : 'auto';
  const candidates = preferred === 'libcurl' ? ['libcurl'] : preferred === 'epoxy' ? ['epoxy'] : ['libcurl', 'epoxy'];
  let lastError;
  for (const candidate of candidates) {
    const path = candidate === 'libcurl' ? '/libcurl/index.mjs' : '/epoxy/index.mjs';
    try {
      await checkAsset(path);
      const options = candidate === 'libcurl' ? [{ websocket: wisp }] : [{ wisp }];
      await connection.setTransport(path, options);
      currentTransport = candidate;
      $('status-transport').textContent = `TRANSPORT · ${candidate.toUpperCase()}`;
      return candidate;
    } catch (error) {
      lastError = error;
      // Explicit choices fail clearly; Auto may try the alternate transport.
      if (preferred !== 'auto') throw error;
    }
  }
  throw lastError || new Error('No supported BareMux transport is available.');
}
function waitForServiceWorker(registration) {
  return new Promise((resolve, reject) => {
    const matches = (worker) => worker && worker.scriptURL.includes(`build=${BUILD_ID}`);
    if (matches(navigator.serviceWorker.controller)) return resolve();
    let done = false;
    const finish = (error) => {
      if (done) return; done = true; clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      error ? reject(error) : resolve();
    };
    const onChange = () => { if (matches(navigator.serviceWorker.controller)) finish(); };
    const timer = setTimeout(() => finish(new Error('The updated service worker did not take control. Close old Portal tabs and reload.')), 15000);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    registration.update().catch(() => {});
    onChange();
  });
}
async function setupProxy() {
  setProxyStatus('connecting', 'STARTING PROXY');
  if (!('serviceWorker' in navigator)) throw new Error('Service workers are unavailable. Open Portal over HTTPS.');
  if (!window.isSecureContext) throw new Error('Portal needs a secure HTTPS context before proxy features can start.');

  // Check only the mandatory engine + mux assets here. chooseTransport() checks
  // each transport separately so Auto can genuinely fall back if one is absent.
  await Promise.all([
    '/baremux/worker.js', '/baremux/index.js',
    '/scram/scramjet.all.js', '/scram/scramjet.wasm.wasm', '/scram/scramjet.sync.js'
  ].map(checkAsset));

  // Load BareMux before Scramjet, following the v1 integration sequence.
  await loadScript(`/baremux/index.js?build=${BUILD_ID}`, () => !!(window.BareMux && typeof window.BareMux.BareMuxConnection === 'function'));

  if (!scramjet) {
    await loadScript(`/scram/scramjet.all.js?build=${BUILD_ID}`, () => typeof window.$scramjetLoadController === 'function');
    const controllerApi = window.$scramjetLoadController();
    const Controller = controllerApi?.ScramjetController;
    if (typeof Controller !== 'function') throw new Error('ScramjetController was not exported by the installed Scramjet bundle.');
    const controller = new Controller({
      prefix: '/~/sj/',
      files: { wasm: '/scram/scramjet.wasm.wasm', all: '/scram/scramjet.all.js', sync: '/scram/scramjet.sync.js' }
    });
    await withTimeout(controller.init(), PROXY_INIT_TIMEOUT_MS, 'Scramjet initialization');
    scramjet = controller;
  }

  if (!connection) connection = new window.BareMux.BareMuxConnection('/baremux/worker.js');
  await withTimeout(chooseTransport(), PROXY_INIT_TIMEOUT_MS, 'Transport setup');
  const wispProbe = await probeWisp();
  if (wispProbe.wisp !== 'websocket-open') throw new Error(wispProbe.message || `Wisp WebSocket check failed: ${wispProbe.wisp}`);

  if (!serviceWorkerRegistration) {
    serviceWorkerRegistration = await navigator.serviceWorker.register(`/sw.js?build=${BUILD_ID}`, { scope: '/', updateViaCache: 'none' });
  }
  await waitForServiceWorker(serviceWorkerRegistration);
  setProxyStatus('ready', `TRANSPORT READY · ${currentTransport.toUpperCase()}`);
  $('status-left').textContent = 'Transport configured; first page load will verify proxy traffic';
  return true;
}
async function ensureProxy() {
  if (!setupPromise) {
    setupPromise = setupProxy().catch((error) => {
      setupPromise = null;
      setProxyStatus('error', 'CONNECTION ERROR');
      throw error;
    });
  }
  return setupPromise;
}
async function go(value, tab = active, options = {}) {
  if (!tab || !tabs.includes(tab) || !value || !String(value).trim()) return;
  const url = toUrl(value);
  if (!url) return;
  const requestId = (tab.navigationRequestId || 0) + 1;
  tab.navigationRequestId = requestId;
  tab.currentUrl = url;
  tab.title = hostOf(url);
  tab.loading = true;
  tab.label.textContent = 'Loading…';
  tab.view.classList.add('nav-on', 'loading');
  if (active === tab) {
    $('bq').value = url;
    $('status-left').textContent = `Connecting to ${hostOf(url)}…`;
  }
  updateNavigationButtons();
  try {
    await ensureProxy();
    if (!tabs.includes(tab) || tab.navigationRequestId !== requestId) return;
    if (!tab.scramFrame) {
      const managedFrame = scramjet.createFrame();
      if (!managedFrame || !managedFrame.frame || typeof managedFrame.go !== 'function') {
        throw new Error('Scramjet did not create a valid managed browser frame.');
      }
      const oldFrame = tab.frame;
      const frame = managedFrame.frame;
      frame.title = 'Proxied webpage';
      frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('allow', 'fullscreen; picture-in-picture');
      frame.className = 'portal-proxy-frame';
      oldFrame.replaceWith(frame);
      tab.frame = frame;
      tab.scramFrame = managedFrame;
      applyFramePermissions(tab);
      attachFrameEvents(tab, frame);
    }
    if (!tabs.includes(tab) || tab.navigationRequestId !== requestId) return;
    if (options.historyIndex !== undefined) tab.historyIndex = options.historyIndex;
    else {
      if (tab.historyIndex < tab.history.length - 1) tab.history = tab.history.slice(0, tab.historyIndex + 1);
      tab.history.push(url);
      if (tab.history.length > 80) tab.history.shift();
      tab.historyIndex = tab.history.length - 1;
    }
    clearTimeout(tab.navigationTimer);
    tab.scramFrame.go(url);
    tab.navigationTimer = setTimeout(() => {
      if (!tabs.includes(tab) || tab.navigationRequestId !== requestId || !tab.loading) return;
      tab.loading = false;
      tab.view.classList.remove('loading');
      if (active === tab) setProxyStatus('error', 'PAGE LOAD TIMED OUT');
      say(`This page did not finish loading: ${hostOf(url)}. The website may be unavailable or may not support this proxy connection.`, 10000);
      updateNavigationButtons();
    }, 60000);
    setTabTitle(tab, hostOf(url));
    if (active === tab) { $('bq').value = url; updateBookmarkButton(); }
    saveSession();
    updateNavigationButtons();
  } catch (error) {
    if (!tabs.includes(tab) || tab.navigationRequestId !== requestId) return;
    tab.loading = false;
    tab.view.classList.remove('loading');
    if (!tab.scramFrame) tab.view.classList.remove('nav-on');
    console.error('Portal navigation failed:', error);
    if (active === tab) setProxyStatus('error', 'CONNECTION ERROR');
    say(`Portal could not start or use the proxy: ${error.message || error}`, 10000);
    updateNavigationButtons();
  }
}
function backTab(tab = active) {
  if (!tab || tab.historyIndex <= 0) return;
  const nextIndex = tab.historyIndex - 1;
  void go(tab.history[nextIndex], tab, { historyIndex: nextIndex });
}
function forwardTab(tab = active) {
  if (!tab || tab.historyIndex >= tab.history.length - 1) return;
  const nextIndex = tab.historyIndex + 1;
  void go(tab.history[nextIndex], tab, { historyIndex: nextIndex });
}
function reloadTab(tab = active) {
  if (!tab?.currentUrl) { if (tab) homeTab(tab); return; }
  void go(tab.currentUrl, tab, { historyIndex: tab.historyIndex });
}
function stopTab(tab = active) {
  if (!tab) return;
  tab.navigationRequestId = (tab.navigationRequestId || 0) + 1;
  clearTimeout(tab.navigationTimer); tab.navigationTimer = null;
  try { tab.frame?.contentWindow?.stop(); } catch { /* Browser may deny cross-origin window access. */ }
  tab.loading = false; tab.view.classList.remove('loading'); updateNavigationButtons();
}
function homeTab(tab = active) {
  if (!tab || !tabs.includes(tab)) return;
  tab.navigationRequestId = (tab.navigationRequestId || 0) + 1;
  clearTimeout(tab.navigationTimer); tab.navigationTimer = null;
  try { tab.frame?.contentWindow?.stop(); } catch {}
  const placeholder = document.createElement('iframe');
  placeholder.title = 'Proxied webpage';
  placeholder.referrerPolicy = 'no-referrer';
  placeholder.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write');
  placeholder.src = 'about:blank';
  tab.frame?.replaceWith(placeholder);
  tab.frame = placeholder;
  tab.scramFrame = null;
  attachFrameEvents(tab, placeholder);
  tab.loading = false;
  tab.view.classList.remove('nav-on', 'loading');
  tab.currentUrl = '';
  tab.title = 'New tab';
  tab.history = [];
  tab.historyIndex = -1;
  setTabTitle(tab, 'New tab');
  if (active === tab) $('bq').value = '';
  renderHome(tab);
  updateBookmarkButton();
  updateNavigationButtons();
  saveSession();
}
function toggleBookmark() {
  if (!active?.currentUrl) { say('Open a page before saving a bookmark.'); return; }
  let list = getBookmarks();
  const exists = list.some((item) => item.url === active.currentUrl);
  list = exists ? list.filter((item) => item.url !== active.currentUrl) : [{ url: active.currentUrl, title: active.title }, ...list];
  writeJSON(KEYS.bookmarks, list.slice(0, 100)); tabs.forEach(renderHome); updateBookmarkButton();
  say(exists ? 'Bookmark removed.' : 'Bookmark saved.');
}
function clearHistory() { writeJSON(KEYS.history, []); tabs.forEach(renderHome); say('Recent pages cleared.'); }
function clearBookmarks() { writeJSON(KEYS.bookmarks, []); tabs.forEach(renderHome); updateBookmarkButton(); say('Bookmarks cleared.'); }
function exportBookmarks() {
  const blob = new Blob([JSON.stringify({ format: 'portal-bookmarks', version: 1, bookmarks: getBookmarks() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'portal-bookmarks.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function importBookmarks(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const items = Array.isArray(parsed) ? parsed : parsed.bookmarks;
    if (!Array.isArray(items)) throw new Error('That file does not contain a Portal bookmark list.');
    const valid = items.filter((item) => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)).slice(0, 100);
    const merged = new Map(getBookmarks().map((item) => [item.url, item]));
    valid.forEach((item) => merged.set(item.url, { url: item.url, title: String(item.title || hostOf(item.url)).slice(0, 140) }));
    writeJSON(KEYS.bookmarks, [...merged.values()].slice(0, 100)); tabs.forEach(renderHome); say(`Imported ${valid.length} bookmarks.`);
  } catch (error) { say(`Could not import bookmarks: ${error.message}`); }
  $('bookmark-file').value = '';
}
function exportSettings() {
  const payload = { format: 'portal-settings', version: 1, exportedAt: new Date().toISOString(), settings };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'portal-settings.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  say('Portal settings exported.');
}
async function importSettings(file) {
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Settings file is larger than 1 MB.');
    const parsed = JSON.parse(await file.text());
    if (!validateSettingsBackup(parsed)) {
      throw new Error('This is not a supported Portal settings backup.');
    }
    settings = normalizeSettings(parsed.settings);
    saveSettings(); applySettings();
    say('Portal settings imported.');
  } catch (error) { say(`Could not import settings: ${error.message}`); }
  $('settings-file').value = '';
}
function resetSettings() {
  if (!confirm('Restore Portal preferences to their defaults? Bookmarks and browsing history will be kept.')) return;
  settings = { ...defaults };
  saveSettings(); applySettings();
  say('Portal preferences restored to defaults.');
}

function openSettings(section = 'general') {
  $('settings-backdrop').classList.add('open'); $('settings-backdrop').setAttribute('aria-hidden', 'false');
  selectSettings(section); $('settings-close').focus();
}
function closeSettings() {
  $('settings-backdrop').classList.remove('open'); $('settings-backdrop').setAttribute('aria-hidden', 'true'); $('settings-btn').focus();
}
function selectSettings(name) {
  const available = new Set([...document.querySelectorAll('[data-settings-section]')].map((section) => section.dataset.settingsSection));
  const selected = available.has(name) ? name : 'general';
  document.querySelectorAll('[data-settings-tab]').forEach((button) => button.classList.toggle('active', button.dataset.settingsTab === selected));
  document.querySelectorAll('[data-settings-section]').forEach((section) => section.classList.toggle('active', section.dataset.settingsSection === selected));
}
function probeWisp(timeoutMs = 8000) {
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/wisp/`;
  return new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => {
      try { socket?.close(); } catch {}
      finish({ wisp: 'timeout', endpoint: url, message: 'The Wisp WebSocket did not accept a connection before the timeout.' });
    }, timeoutMs);
    try {
      socket = new WebSocket(url);
      socket.addEventListener('open', () => {
        finish({ wisp: 'websocket-open', endpoint: url, protocol: socket.protocol || 'Wisp WebSocket' });
        try { socket.close(1000, 'Portal connectivity probe complete'); } catch {}
      }, { once: true });
      socket.addEventListener('error', () => finish({ wisp: 'failed', endpoint: url, message: 'WebSocket handshake failed. Check the signed-in session and server logs.' }), { once: true });
      socket.addEventListener('close', (event) => { if (!settled) finish({ wisp: 'closed-before-open', code: event.code, endpoint: url }); }, { once: true });
    } catch (error) { finish({ wisp: 'failed', endpoint: url, message: error.message }); }
  });
}
async function testWisp() {
  $('diag-output').style.display = 'block'; $('diag-output').textContent = 'Testing authenticated WebSocket handshake…';
  const result = await probeWisp();
  $('diag-output').textContent = JSON.stringify(result, null, 2);
  return result;
}
async function runDiagnostics() {
  const output = $('diag-output'); output.style.display = 'block'; output.textContent = 'Checking server, assets, browser support, and Wisp…';
  const results = { build: BUILD_ID, page: location.origin, checks: {} };
  for (const path of ['/healthz', '/__portal/diagnostics']) {
    try { const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin' }); results.checks[path] = { http: response.status, body: await response.json() }; }
    catch (error) { results.checks[path] = { error: error.message }; }
  }
  results.checks.browser = {
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    sharedWorker: 'SharedWorker' in window,
    wasm: typeof WebAssembly === 'object',
    secureContext: window.isSecureContext
  };
  if (navigator.serviceWorker?.controller) results.checks.serviceWorkerController = navigator.serviceWorker.controller.scriptURL;
  await testWisp().then((result) => { results.checks.wisp = result; });
  output.textContent = JSON.stringify(results, null, 2);
  return results;
}
async function logout() {
  try { await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' }); }
  finally { location.replace('/login'); }
}

function bindEvents() {
  $('plus').addEventListener('click', newTab);
  $('bf').addEventListener('submit', (event) => { event.preventDefault(); void go($('bq').value); });
  $('clear-address').addEventListener('click', () => { $('bq').value = ''; $('bq').focus(); });
  $('back').addEventListener('click', () => backTab());
  $('fwd').addEventListener('click', () => forwardTab());
  $('reload').addEventListener('click', () => reloadTab());
  $('stop').addEventListener('click', () => stopTab());
  $('home-btn').addEventListener('click', () => homeTab());
  $('bookmark-page').addEventListener('click', toggleBookmark);
  $('duplicate-tab').addEventListener('click', () => duplicateTab());
  $('reopen-tab').addEventListener('click', reopenClosedTab);
  $('tab-context-menu').querySelectorAll('[data-tab-action]').forEach((button) => button.addEventListener('click', () => {
    const tab = contextTab; const action = button.dataset.tabAction;
    if (action === 'new') newTab();
    else if (action === 'duplicate') duplicateTab(tab);
    else if (action === 'copy') void copyCurrentAddress(tab);
    else if (action === 'reload') reloadTab(tab);
    else if (action === 'pin' && tab) setTabPinned(tab, !tab.pinned);
    else if (action === 'others' && tab) closeOtherTabs(tab);
    else if (action === 'close' && tab) closeTab(tab);
    hideTabMenu();
  }));
  document.addEventListener('click', (event) => { if (!$('tab-context-menu').contains(event.target)) hideTabMenu(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTabMenu(); });
  $('settings-btn').addEventListener('click', () => openSettings('general'));
  $('settings-close').addEventListener('click', closeSettings);
  $('settings-backdrop').addEventListener('click', (event) => { if (event.target === $('settings-backdrop')) closeSettings(); });
  document.querySelectorAll('[data-settings-tab]').forEach((button) => button.addEventListener('click', () => selectSettings(button.dataset.settingsTab)));
  $('theme-select').addEventListener('change', function () { settings.theme = this.value; saveSettings(); applySettings(); });
  $('motion-toggle').addEventListener('change', function () { settings.animations = this.checked; saveSettings(); applySettings(); });
  $('history-toggle').addEventListener('change', function () { settings.saveHistory = this.checked; if (!settings.saveHistory) writeJSON(KEYS.history, []); saveSettings(); tabs.forEach(renderHome); });
  $('restore-toggle').addEventListener('change', function () { settings.restoreSession = this.checked; saveSettings(); if (!this.checked) localStorage.removeItem(KEYS.session); say('Session restore preference saved.'); });
  $('engine-select').addEventListener('change', function () { settings.searchEngine = this.value; saveSettings(); say('Search engine updated.'); });
  $('max-tabs-select').addEventListener('change', function () {
    const next = Number(this.value);
    settings.maxTabs = ALLOWED_MAX_TABS.includes(next) ? next : DEFAULT_MAX_TABS;
    saveSettings(); this.value = String(settings.maxTabs);
    say(`New-tab limit set to ${settings.maxTabs}. Existing tabs were kept.`);
  });
  $('compact-tabs-toggle').addEventListener('change', function () { settings.compactTabs = this.checked; saveSettings(); applySettings(); });
  $('export-settings').addEventListener('click', exportSettings);
  $('import-settings').addEventListener('click', () => $('settings-file').click());
  $('settings-file').addEventListener('change', function () { void importSettings(this.files?.[0]); });
  $('reset-settings').addEventListener('click', resetSettings);
  $('transport-select').addEventListener('change', async function () {
    const previous = settings.transport;
    settings.transport = this.value;
    saveSettings();
    if (!connection) {
      currentTransport = null;
      applySettings();
      say('Transport preference saved. It will be selected when the proxy starts.');
      return;
    }
    try {
      await chooseTransport();
      say(`Transport changed to ${currentTransport}. Reload the active page to use the new transport.`);
    } catch (error) {
      settings.transport = previous;
      this.value = previous;
      saveSettings();
      applySettings();
      say(`Could not switch transport: ${error.message}`);
    }
  });
  [['autoplay-toggle', 'allowAutoplay'], ['clipboard-toggle', 'allowClipboard'], ['fullscreen-toggle', 'allowFullscreen']].forEach(([id, key]) => {
    $(id).addEventListener('change', function () { settings[key] = this.checked; saveSettings(); applySettings(); say('Embedded-site permission preference updated. Sites may still ask for browser permission.'); });
  });
  $('clear-history-setting').addEventListener('click', clearHistory);
  $('export-history').addEventListener('click', exportHistory);
  $('clear-bookmarks-setting').addEventListener('click', clearBookmarks);
  $('export-bookmarks').addEventListener('click', exportBookmarks);
  $('import-bookmarks').addEventListener('click', () => $('bookmark-file').click());
  $('bookmark-file').addEventListener('change', function () { void importBookmarks(this.files?.[0]); });
  $('forget-data').addEventListener('click', () => {
    if (!confirm('Forget all Portal preferences, bookmarks, recent pages, and saved session tabs on this device? This does not clear website cookies or server logs.')) return;
    Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
    settings = { ...defaults }; saveSettings(); applySettings(); tabs.forEach(renderHome); updateBookmarkButton(); say('Portal workspace data cleared.');
  });
  $('logout').addEventListener('click', () => void logout());
  $('run-diagnostics').addEventListener('click', () => void runDiagnostics());
  $('test-wisp').addEventListener('click', () => void testWisp());
  $('copy-diagnostics').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('diag-output').textContent || 'No diagnostics yet.'); say('Diagnostics copied.'); }
    catch { say('Clipboard is unavailable. Select and copy the diagnostics text manually.'); }
  });
  $('fullscreen-btn').addEventListener('click', () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch((error) => say(`Fullscreen unavailable: ${error.message}`));
    else if (document.exitFullscreen) document.exitFullscreen();
  });
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); backTab(); return; }
    if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); forwardTab(); return; }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === 'l') { event.preventDefault(); $('bq').focus(); $('bq').select(); }
    else if ((event.ctrlKey || event.metaKey) && key === 't') { event.preventDefault(); newTab(); }
    else if ((event.ctrlKey || event.metaKey) && key === 'w') { event.preventDefault(); if (active) closeTab(active); }
    else if ((event.ctrlKey || event.metaKey) && key === 'r') { event.preventDefault(); reloadTab(); }
    else if ((event.ctrlKey || event.metaKey) && event.shiftKey && key === 't') { event.preventDefault(); reopenClosedTab(); }
    else if ((event.ctrlKey || event.metaKey) && key === 'd') { event.preventDefault(); toggleBookmark(); }
    else if (event.key === 'Escape' && $('settings-backdrop').classList.contains('open')) closeSettings();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'PORTAL_SCRAMJET_ERROR') {
      console.error('Portal service-worker diagnostics:', event.data.details);
      setProxyStatus('error', 'PROXY ERROR');
      say(`Proxy request failed: ${event.data.details?.message || 'Unknown service-worker error'}`, 10000);
    }
  });
  window.addEventListener('error', (event) => console.error('Portal page error:', event.error || event.message));
  window.addEventListener('beforeunload', saveSession);
}

function restoreSession() {
  const saved = settings.restoreSession ? readJSON(KEYS.session, null) : null;
  if (saved && Array.isArray(saved.pages) && saved.pages.length) {
    const pages = saved.pages.filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url)).slice(-8);
    if (pages.length) {
      const restored = [];
      pages.forEach((url) => {
        const tab = createTab();
        if (tab) { if (Array.isArray(saved.pinnedUrls) && saved.pinnedUrls.includes(url)) setTabPinned(tab, true, false); restored.push(tab); void go(url, tab); }
      });
      const activeIndex = Math.min(Math.max(0, Number(saved.active) || 0), restored.length - 1);
      if (restored[activeIndex]) select(restored[activeIndex]);
      return;
    }
  }
  newTab();
}

applySettings();
bindEvents();
restoreSession();
