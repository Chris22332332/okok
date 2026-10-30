# Portal Browser v13.2 — Test Results

Tested locally with Node.js v22.16.0. The package declares `node >=22.9 <23`; the Render log supplied by the owner previously confirmed Render selected Node v22.23.4.

## Tests that passed

- `npm test`: 29/29 Node unit tests passed.
- `npm run check`: 46 PASS checks covering syntax, import/export, HTML selector, duplicate-ID, settings-control, service-worker, security wiring, Render metadata, build-ID, and required visible files passed.
- Upload-layout regression test: a clean copy with all hidden dotfiles omitted still passes `scripts/check.mjs`. This reproduces the GitHub browser-upload behavior that caused the previous `.node-version` failure and anticipates omission of `.env.example` / `.gitignore` as well.
- ZIP archive integrity: verified after packaging.

## Evidence from the owner's Render log

- Render selected Node.js v22.23.4 from `package.json`'s `engines` declaration.
- `npm install` completed and added 98 packages.
- npm reported 0 vulnerabilities in that deployment.
- All 28 tests in the then-deployed v13 build passed.
- The build then failed in `scripts/check.mjs` because the hidden `.node-version` file was absent from the Git checkout.

## Fixes made for v13.2

- Removed `.node-version` from the delivery package. `package.json` is the authoritative Node version declaration.
- Replaced hidden `.env.example` with visible `ENVIRONMENT.example.txt`.
- Removed all hidden files from the checker's required-file list.
- Added `tests/upload-layout.test.mjs`, which copies the project without hidden dotfiles and runs the structural checker in that simulated GitHub-upload layout.
- Bumped the coordinated application, server, HTML, and service-worker build identifier to `portal-20261030-13.2`.

## Not yet verified

- A fresh npm dependency installation in this authoring environment timed out, so there is no locally generated `package-lock.json`. An offline `npm audit` also cannot run without a lockfile. The owner-provided Render install log reported 0 vulnerabilities for the prior v13 install.
- The actual package preflight (`npm run preflight`) has not yet been run against real installed modules in this environment.
- No genuine browser automation run, Wisp handshake, or external proxied navigation was completed here.

The owner's previous Render log proves dependency installation succeeded for the prior v13 dependency set, but it does not prove that v13.2's real-package preflight, server startup, Wisp handshake, or website navigation will succeed. Those must be confirmed in the next Render deployment.
