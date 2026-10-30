/**
 * Pure settings validation shared by the browser and Node's unit tests.
 * Unknown keys are discarded so untrusted imported JSON cannot grow the
 * persistent settings object or override internal application properties.
 */
export function normalizePortalSettings(value, defaults, allowedSearchEngines, allowedTabLimits) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = { ...defaults, ...source };

  if (!['aurora', 'nebula', 'plum'].includes(normalized.theme)) normalized.theme = defaults.theme;
  if (!allowedSearchEngines.includes(normalized.searchEngine)) normalized.searchEngine = defaults.searchEngine;
  if (!['auto', 'libcurl', 'epoxy'].includes(normalized.transport)) normalized.transport = defaults.transport;

  for (const key of ['animations', 'saveHistory', 'restoreSession', 'allowAutoplay', 'allowClipboard', 'allowFullscreen', 'compactTabs']) {
    if (typeof normalized[key] !== 'boolean') normalized[key] = defaults[key];
  }

  const maxTabs = Number(normalized.maxTabs);
  normalized.maxTabs = allowedTabLimits.includes(maxTabs) ? maxTabs : defaults.maxTabs;

  return Object.fromEntries(Object.keys(defaults).map((key) => [key, normalized[key]]));
}

export function validateSettingsBackup(payload) {
  return Boolean(
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    payload.format === 'portal-settings' &&
    payload.version === 1 &&
    payload.settings &&
    typeof payload.settings === 'object' &&
    !Array.isArray(payload.settings)
  );
}
