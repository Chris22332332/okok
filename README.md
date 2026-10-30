# Portal Browser v13

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

This build intentionally retains the Scramjet 1.1 + BareMux 2.1 + Libcurl 1.x + Epoxy 2.x API generation because the existing browser code uses the Scramjet 1.x controller and BareMux's path-based `setTransport(path, args)` contract. BareMux 2.1.9 is deprecated upstream; the newer Scramjet 2.x architecture is a coordinated migration involving different controller, utility, and transport packages. Updating only one package would mix incompatible APIs. A complete migration should be done as a separate, fully tested engineering change.

## Requirements

- Node.js 22.9 or newer, below Node 23
- npm
- Internet access for dependency installation

## Local setup

1. Extract the project folder and open a terminal in the folder containing `package.json`.
2. Copy `.env.example` to `.env`.
3. Replace the sample password and session secret with two separate random values if you want local sign-in. Do not commit `.env`.
4. Run `npm install`.
5. Run `npm test` and `npm run preflight`.
6. Run `npm start`.
7. Open `http://127.0.0.1:8080`.

The local server binds to `127.0.0.1` unless it detects Render. This is deliberate: local unauthenticated development must not expose a network-accessible proxy.

## Commands

- `npm test` — 28 Node unit tests plus project, syntax, and HTML structure checks.
- `npm run check` — structural and syntax checks.
- `npm run preflight` — imports installed server packages and checks actual package exports and required assets.
- `npm start` — runs the real package preflight before starting the server.
- `npm audit --omit=dev` — review production dependency advisories after installation.

## Deployment

See [RENDER-DEPLOYMENT.md](RENDER-DEPLOYMENT.md). Build uses `npm install && npm test && npm run preflight`; start uses `npm start`; health check is `/healthz`.

## Important limitations

The authoring environment could not resolve `registry.npmjs.org`, so actual npm installation, real-package preflight, server startup, browser automation, a Wisp handshake, and external proxied navigation could not be completed here. The passing unit/static checks are not proof of a working proxy. Follow the post-deployment checks in the Render guide. Some sites may reject proxy traffic or embedded browsing. Portal does not override firewall, school/work network, device-management, account, or website access controls.
