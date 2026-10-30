# Portal Browser Security Notes

Portal is designed as a private personal browser workspace, not an unrestricted public relay.

## Required hosted settings

- `PORTAL_ACCESS_PASSWORD`: at least 20 characters; use a randomly generated value.
- `PORTAL_SESSION_SECRET`: a separate random value of at least 32 characters.
- `NODE_ENV=production`.

Never commit `.env` or reveal secrets in logs, screenshots, or chat.

## Session and request protections

- Signed HMAC session tokens.
- HTTP-only, SameSite=Strict cookies; Secure is set when Express detects HTTPS through the configured trusted proxy.
- Login rate limiting.
- Same-origin validation for login/logout and Wisp WebSocket upgrades.
- Wisp upgrades require a valid GET WebSocket upgrade on `/wisp/`.
- Hosted access requires a valid session.
- Wisp UDP, direct-IP, private-IP, and loopback access are disabled.
- Wisp TCP destination ports are restricted to 80 and 443.
- Wisp stream counts are capped.

## Local development

Without a local access password, the server binds only to `127.0.0.1`. Do not change it to `0.0.0.0` or expose port 8080 without enabling authentication and reviewing the network policy.

## Limitations

In-memory login rate limiting resets when the process restarts and is not shared across multiple instances. A single free Render instance is the intended initial setup. For multi-instance production use, move rate limiting/session revocation to a shared store and review Wisp resource policies and operational logging.

Portal does not bypass device-management or school/work network policies, authentication requirements, paywalls, or website access restrictions. It cannot guarantee compatibility with every destination.
