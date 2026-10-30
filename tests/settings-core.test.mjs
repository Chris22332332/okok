import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePortalSettings, validateSettingsBackup } from '../public/settings-core.js';

const defaults = {
  theme: 'aurora', animations: true, saveHistory: true, restoreSession: true,
  searchEngine: 'duckduckgo', transport: 'auto', allowAutoplay: false,
  allowClipboard: false, allowFullscreen: true, maxTabs: 16, compactTabs: false
};
const engines = ['duckduckgo', 'brave', 'google', 'bing'];
const limits = [8, 12, 16, 24];

test('settings normalization returns defaults for null, arrays, and invalid inputs', () => {
  assert.deepEqual(normalizePortalSettings(null, defaults, engines, limits), defaults);
  assert.deepEqual(normalizePortalSettings([], defaults, engines, limits), defaults);
});

test('settings normalization preserves supported choices', () => {
  const result = normalizePortalSettings({ theme: 'plum', searchEngine: 'brave', transport: 'epoxy', maxTabs: '24', compactTabs: true }, defaults, engines, limits);
  assert.equal(result.theme, 'plum');
  assert.equal(result.searchEngine, 'brave');
  assert.equal(result.transport, 'epoxy');
  assert.equal(result.maxTabs, 24);
  assert.equal(result.compactTabs, true);
});

test('settings normalization rejects unknown enum values and invalid tab limits', () => {
  const result = normalizePortalSettings({ theme: 'electric', searchEngine: 'unknown', transport: 'magic', maxTabs: 999 }, defaults, engines, limits);
  assert.equal(result.theme, defaults.theme);
  assert.equal(result.searchEngine, defaults.searchEngine);
  assert.equal(result.transport, defaults.transport);
  assert.equal(result.maxTabs, defaults.maxTabs);
});

test('string booleans do not accidentally enable privacy or permission toggles', () => {
  const result = normalizePortalSettings({ saveHistory: 'false', allowAutoplay: 'true', compactTabs: 'true' }, defaults, engines, limits);
  assert.equal(result.saveHistory, defaults.saveHistory);
  assert.equal(result.allowAutoplay, defaults.allowAutoplay);
  assert.equal(result.compactTabs, defaults.compactTabs);
});

test('unknown imported properties are discarded', () => {
  const result = normalizePortalSettings({ theme: 'nebula', isAdmin: true, accessToken: 'not-allowed' }, defaults, engines, limits);
  assert.equal(Object.hasOwn(result, 'isAdmin'), false);
  assert.equal(Object.hasOwn(result, 'accessToken'), false);
  assert.equal(result.theme, 'nebula');
});

test('settings backup accepts only the supported format and version', () => {
  assert.equal(validateSettingsBackup({ format: 'portal-settings', version: 1, settings: {} }), true);
  assert.equal(validateSettingsBackup({ format: 'other', version: 1, settings: {} }), false);
  assert.equal(validateSettingsBackup({ format: 'portal-settings', version: 2, settings: {} }), false);
  assert.equal(validateSettingsBackup({ format: 'portal-settings', version: 1, settings: [] }), false);
  assert.equal(validateSettingsBackup(null), false);
});
