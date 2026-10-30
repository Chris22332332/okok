# Portal Browser v13 — Engineering Audit Notes

## Confirmed source findings and changes

1. **Wisp URL normalization:** the upgrade request path is normalized to `/wisp/` before Wisp routing; query strings cannot change the Wisp route.
2. **WebSocket request validation:** upgrades require GET, `Upgrade: websocket`, and `Connection: upgrade`.
3. **HTTP rejection reliability:** Origin/session failures use `socket.end()` to flush an HTTP response.
4. **Wisp error handling:** synchronous throws and asynchronous route rejections are handled.
5. **Local binding:** local development binds to `127.0.0.1`; Render binds to `0.0.0.0` and requires credentials.
6. **Trusted proxy handling:** Express trusts one Render proxy hop only on Render. Secure cookies use `req.secure`.
7. **Transport selection:** invalid overrides normalize to Auto; Auto attempts Libcurl then Epoxy.
8. **Proxy retries:** already-initialized Scramjet and BareMux instances are reused after partial initialization.
9. **Service-worker scope:** only Scramjet-prefixed requests go through Scramjet; shell and worker/transport assets bypass it.
10. **Storage safety:** Portal does not inspect, delete, or close Scramjet IndexedDB; Scramjet owns its schema.
11. **Preflight coverage:** real package imports, expected exports, BareMux browser bundle marker, transport assets, and local browser modules are checked before startup.
12. **Diagnostics:** `/__portal/diagnostics` checks Scramjet, BareMux, Libcurl, Epoxy, settings-core, and tab-core assets.
13. **Wisp tests:** malformed upgrade requests, path normalization, Origin/session rejection, and sync/async routing errors have dedicated tests.
14. **Settings UI:** expanded from five to ten functional sections: General, Appearance, Search, Tabs, Privacy, Permissions, Connection, Advanced, Diagnostics, and About.
15. **Settings backup:** import/export/reset is implemented; imported files are size-limited and schema-validated. Unknown settings are discarded and boolean settings use strict type validation.
16. **Tab controls:** maximum tabs is configurable (8/12/16/24), compact tabs are supported, and tabs can be pinned/unpinned and dragged within their pinned/unpinned group. Pinned URLs are restored with the session.
17. **Regression tests:** pure settings and tab-order utilities have dedicated Node tests.

## Version-generation decision

This package retains Scramjet 1.1.0 + BareMux 2.1.9 + Libcurl 1.5.2 + Epoxy 2.1.28 + Wisp JS 0.4.1 because the supplied browser code uses the Scramjet 1.x controller and BareMux's path-based `setTransport()` API. BareMux is deprecated upstream; Scramjet 2.x uses a different coordinated controller/utility/transport architecture. Updating one package alone would mix incompatible APIs. A full migration is a separate project-sized change.

## Remaining verification gaps

- No `package-lock.json`: the npm registry did not resolve from this authoring environment (`EAI_AGAIN`). Direct dependencies are exact-pinned, but transitive dependencies are not lockfile-pinned.
- Real npm installation and actual package preflight could not be completed here.
- Real Express/Wisp process startup was not verified.
- Chromium local/file navigation was blocked by environment policy; no genuine browser UI automation or screenshot is claimed.
- Live Wisp WebSocket handshake and external HTTPS navigation through Scramjet remain unverified.
- `npm audit` was not completed against a fully installed dependency tree.

These gaps must be closed on an npm-connected machine and then on the new Render deployment before claiming end-to-end proxy functionality.
