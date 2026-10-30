# Portal Browser v13.2

Portal Browser is a purple-themed private browser workspace built with Node.js 22, Express, Scramjet 1.x, BareMux 2.x, Libcurl/Epoxy transports, and Wisp JS. Hosted proxy access is password-protected and WebSocket upgrades are checked for a valid session and same-origin request.

## Browser features

- Address/search bar with DuckDuckGo, Brave, Google, and Bing search options.
- Tabs: create, close, duplicate, reopen, context menu, drag to reorder, pin/unpin, and close other unpinned tabs.
- Tab limits (8, 12, 16, or 24) and compact tab-strip mode.
- Bookmarks: add/remove, import, and export.
- Recent pages/history: local storage, clear, and export.
- Session restoration for up to eight visited tabs.
- Ten settings sections: General, Appearance, Search, Tabs, Privacy, Permissions, Connection, Advanced, Diagnostics, and About.
- Three purple themes, reduced-motion control, settings import/export, and reset-to-defaults.
- Keyboard shortcuts including Ctrl+L, Ctrl+T, Ctrl+W, Ctrl+R, and Ctrl+Shift+T.

## Architecture decision

This build intentionally retains the Scramjet 1.1 + BareMux 2.1 + Libcurl 1.x + Epoxy 2.x API generation because the existing browser code uses the Scramjet 1.x controller and BareMux's path-based `setTransport(path, args)` contract. BareMux 2.1.9 is deprecated upstream; newer Scramjet 2.x requires a coordinated migration involving a different controller, utility, and transport architecture. Updating only one package would mix incompatible APIs.

## Requirements

- Node.js 22.9 or newer, below Node 23 (selected through `package.json` `engines`)
- npm
- Internet access for dependency installation

## Local setup

1. Extract the project and open a terminal in the folder containing `package.json`.
2. Optionally copy `ENVIRONMENT.example.txt` to `.env` for local development; replace the sample credentials with two different random values and never commit `.env`.
3. Run `npm install`.
4. Run `npm test` and `npm run preflight`.
5. Run `npm start`.
6. Open `http://127.0.0.1:8080`.

The local server binds to `127.0.0.1` unless it detects Render. Local unauthenticated development must not expose a network-accessible proxy.

## Commands

- `npm test` — 29 Node unit tests plus project, syntax, upload-layout, and HTML structure checks.
- `npm run check` — structural and syntax checks.
- `npm run preflight` — imports installed server packages and checks actual package exports and required assets.
- `npm start` — runs the real package preflight before starting the server.
- `npm audit --omit=dev` — review production dependency advisories after installation.

## Deployment

See [RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md). Build uses `npm install && npm test && npm run preflight`; start uses `npm start`; health check is `/healthz`.

## Important limitations

The authoring environment could not complete a fresh npm installation, so a lockfile was not generated and the real package preflight, server startup, browser automation, Wisp handshake, and external proxied navigation were not completed here. The owner's Render log does show a successful install of the prior v13 dependencies (98 packages, 0 vulnerabilities), but the real v13.2 package preflight and runtime path still need deployment verification. Passing unit/static checks is not proof of a working proxy. Some sites may reject proxy traffic or embedded browsing. Portal does not override firewall, school/work network, device-management, account, or website access controls.
