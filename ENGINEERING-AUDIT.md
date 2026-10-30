# Portal Browser v13.2 — Engineering Audit

## Existing architecture retained

- Node.js 22 / Express 5.
- Scramjet 1.1.0 with its v1 controller API.
- BareMux 2.1.9.
- Libcurl transport 1.5.2.
- Epoxy transport 2.1.28.
- Wisp JS 0.4.1.
- Password-based hosted access, signed session cookies, and same-origin WebSocket validation.
- Purple browser UI with tabs, bookmarks, history, settings, diagnostics, and local session features.

## Concrete deployment defect reproduced from Render log

The owner's Render build selected Node 22.23.4 from `package.json`, installed 98 packages, reported 0 vulnerabilities, and passed all 28 tests. It then failed because `scripts/check.mjs` required `.node-version` to exist. That hidden file was absent from the Git checkout even though the package engine was already selecting Node 22 correctly.

The previous patch made `.node-version` optional. A second likely failure was then identified: `.env.example` was also hidden and still listed as a required file. A GitHub browser upload can omit hidden files, so the checker could simply have failed on the next hidden file.

## v13.2 corrections

1. Node version is selected from `package.json` `engines` (`>=22.9 <23`); no `.node-version` file is required.
2. The hidden `.env.example` template is now `ENVIRONMENT.example.txt`, a normal visible file.
3. The structural checker requires only visible project files.
4. A regression test deliberately copies the project while omitting every hidden dotfile, then runs the structural checker. It passes.
5. A clean mock preflight run passed all seven server package imports and expected browser asset checks; this validates the preflight code path, not the real installed packages.
6. The build ID is consistently `portal-20261030-13.2` across server, HTML, app JS, and service worker.

## Compatibility decision

The browser code is built against Scramjet 1.x and BareMux 2.x. The matching transport generations are Libcurl 1.x and Epoxy 2.x. Do not upgrade one of these packages independently. Moving to Scramjet 2.x requires a coordinated architecture migration with the newer controller and transport interface, not a one-package bump.

## Remaining verification boundary

The source-level checks and Node unit tests pass. This environment could not complete an npm dependency installation, so the real installed-package preflight and live proxy path remain unverified. The next Render build must be treated as the next integration test, not as guaranteed success. If preflight reports a missing export or asset, fix that exact mismatch before proceeding to the server/Wisp/browser tests.
