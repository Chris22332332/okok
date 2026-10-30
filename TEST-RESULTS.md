# Portal Browser v13 — Test Results

## Passed locally

- **28 Node.js built-in unit tests passed.** Coverage includes sessions, token validation, login throttling, Origin validation, Wisp upgrade handling, settings normalization/import validation, and pinned/drag-reordered tab ordering.
- **45 explicit static/syntax/file/configuration PASS checks** printed by the project check suite.
- Node syntax checks passed for server, security, Wisp upgrade helper, service worker, settings module, tab module, browser app, and preflight.
- HTML selector audit: 56 IDs referenced through the app's `$()` helper exist; 61 HTML IDs are unique; no duplicate IDs were found. All ten settings navigation buttons have accessible names and mobile tooltips.
- Login page inline JavaScript syntax check passed.
- Required project file structure and Render Blueprint checks passed.
- Settings core unit tests verify strict booleans, enum validation, tab limit allowlist, unknown-property removal, and settings backup format validation.
- Tab core unit tests verify pin/unpin grouping, same-group reordering, preventing movement between pinned and unpinned groups, and non-mutating reorder operations.
- Wisp upgrade tests cover path normalization, ignored paths, Origin/session rejection, invalid upgrade headers, synchronous route errors, and asynchronous route rejections.
- The archive's integrity was checked after packaging.

## Not verified in this environment

- Fresh installation of actual npm dependencies. `npm install` could not complete because DNS resolution for `registry.npmjs.org` failed (`EAI_AGAIN` / host resolution failure).
- `package-lock.json` generation and reproducible `npm ci` installation.
- Real package preflight against installed packages. `node_modules` is unavailable; the real preflight correctly reports missing dependencies in this environment.
- `npm audit` against a fully installed dependency tree.
- Actual Express server startup using the real dependencies.
- Real browser rendering/interaction test. Chromium was available but this environment blocked both local HTTP and file navigation with `net::ERR_BLOCKED_BY_ADMINISTRATOR`.
- Real authenticated Wisp WebSocket handshake.
- Real Scramjet transport fetch and external HTTPS website navigation.
- Live Render deployment test.

## Interpretation

The 28 passing tests and 45 static checks validate the code paths that can be tested without the external packages. They do not prove the actual dependency tree installs or that proxy traffic works end-to-end. Render's build command runs `npm install && npm test && npm run preflight`; on Render, preflight imports the actual installed server modules and checks their exports and required asset files. After deployment, confirm the Wisp handshake and load a real permitted HTTPS page. Do not describe the proxy as fully verified until those live tests pass.
