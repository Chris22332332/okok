# Portal Browser v13.2 — New Render Web Service

## GitHub

1. Create a new repository, for example `portal-browser-v13-2`.
2. Extract the ZIP.
3. Upload the contents of the extracted folder to the repository root. Do not upload the ZIP itself or create an extra nested folder.
4. Verify `package.json`, `server.js`, `render.yaml`, `ENVIRONMENT.example.txt`, and the `public`, `src`, `scripts`, and `tests` folders are at the top level.
5. The project deliberately does not require hidden dotfiles such as `.node-version`, `.env.example`, or `.gitignore` for its tests to pass. Node is selected from `package.json` `engines`.
6. Commit to `main`.

## Render service settings

Create **New + → Web Service** and connect the new repository.

| Setting | Value |
|---|---|
| Name | `portal-browser-v13-2` (or another available name) |
| Runtime | Node |
| Branch | `main` |
| Root Directory | Leave blank |
| Build Command | `npm install && npm test && npm run preflight` |
| Start Command | `npm start` |
| Health Check Path | `/healthz` |
| Instance | Free for initial verification |

The project does not include `package-lock.json` because the authoring environment could not complete a registry download. The build therefore uses `npm install`, not `npm ci`. After a successful install on a computer with registry access, you can generate and commit a lockfile; only then change the build command to `npm ci && npm test && npm run preflight`.

## Environment variables

Add these in Render → Environment:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORTAL_ACCESS_PASSWORD` | Your own random value, at least 20 characters |
| `PORTAL_SESSION_SECRET` | A different random value, at least 32 characters |

Generate secrets locally with Node (run each command separately):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Do not put secrets in GitHub, screenshots, source code, or chat. `render.yaml` requests a generated session secret. Render will prompt for `PORTAL_ACCESS_PASSWORD` because it is marked `sync: false`.

Do not set `PORT` manually; Render supplies it. No API key, Secret File, or Pre-Deploy Command is required.

## Expected build and startup

The build should show 29 Node unit tests passing, followed by the structural checks and:

```text
PORTAL DEPLOYMENT PREFLIGHT PASSED
```

The startup log should include:

```text
Portal portal-20261030-13.2 listening on 0.0.0.0:<Render-assigned-port>
Access password: enabled
```

The health endpoint should resemble:

```json
{
  "ok": true,
  "service": "portal-browser",
  "build": "portal-20261030-13.2",
  "authEnabled": true,
  "nodeMajor": 22
}
```

## Post-deployment verification

1. Open `/healthz`; confirm the build ID and `authEnabled:true`.
2. Sign in at `/login` using `PORTAL_ACCESS_PASSWORD`.
3. Open Settings → Diagnostics → Run full diagnostics.
4. Confirm all Scramjet, BareMux, Libcurl, Epoxy, settings-core, and tab-core asset checks are true.
5. Confirm the authenticated Wisp WebSocket probe reports `websocket-open`.
6. Load a simple permitted HTTPS page such as `https://example.com` through Portal.
7. Check Render logs and the browser console for errors.

A successful Render health check proves only that Express serves HTTP. A WebSocket opening proves only that the handshake opened. Verify an actual proxied website separately.

## Troubleshooting

- `PORTAL DEPLOYMENT PREFLIGHT FAILED`: read the exact missing package export or asset. Check repository root and dependency generation.
- `PORTAL_ACCESS_PASSWORD ... required`: add a random value of at least 20 characters.
- `PORTAL_SESSION_SECRET ... required`: add a different random value of at least 32 characters.
- Wisp handshake fails: ensure the browser is signed in; inspect WebSocket status and Render logs.
- BareMux worker or local module missing: inspect `/__portal/diagnostics` and ensure all `public` files are in the repository.
- Old service worker: close all Portal tabs, reopen the deployed site, then hard-reload. Do not manually delete Scramjet IndexedDB as a routine fix.
- Render free services can sleep or restart; the first request after idle may be slow.
