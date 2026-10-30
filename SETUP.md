# Portal Browser — Local Windows Setup

## 1. Install Node.js

Install Node.js 22 (22.9 or newer, below 23) from https://nodejs.org/. Open Command Prompt and verify:

```powershell
node -v
npm -v
```

## 2. Extract the project

Extract the ZIP. Open the extracted folder in File Explorer. Click the address bar, type `cmd`, and press Enter. Confirm that `package.json` is in the current directory:

```powershell
dir package.json
```

## 3. Configure local secrets

Copy `.env.example` to `.env`. Use two different random values for `PORTAL_ACCESS_PASSWORD` and `PORTAL_SESSION_SECRET` if you want local sign-in enabled. Do not commit `.env`.

Generate values with Node:

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

For an isolated local test only, the app may run without `PORTAL_ACCESS_PASSWORD`; in that mode it binds only to `127.0.0.1` and has no login gate. Do not expose that mode to other devices.

## 4. Install and test

```powershell
npm install
npm test
npm run preflight
npm start
```

Open http://127.0.0.1:8080. Keep the terminal open while using Portal. Press Ctrl+C in the terminal to stop it.

## 5. If installation fails

- Check that Node is version 22, not 18 or 20.
- Check internet access and retry `npm install`.
- Read the first npm error, not only the final summary.
- Do not delete `package.json` or randomly change package versions.
- After a successful install, `npm run preflight` verifies real installed imports and assets.

The source bundle does not include `node_modules`. The dependencies must be installed on your machine.
