# Changelog

## [1.0.2] — 2026-03-20

### Fixed
- **OAuth tokens now sent as Bearer auth** — OAuth tokens (`sk-ant-oat01-*`) must be sent in the `Authorization: Bearer` header, not `X-Api-Key`. The bridge now detects OAuth tokens and creates the Anthropic client with `authToken` instead of `apiKey`. This restores access to all Claude 4.x models (Opus, Sonnet, Haiku) when using a Claude Code OAuth token.

## [1.0.1] — 2026-03-12

### Added
- **Request timeout** — API calls abort after 120 s (configurable via `timeoutMs`). Returns HTTP 504 on timeout.
- **Auto-retry** — 429 (rate limited) and 529 (overloaded) responses are retried once after 1 s before returning to the caller.
- **Dynamic token refresh** — Anthropic client is re-created whenever the token on disk changes. No restart needed after token rotation.
- **Custom `.env` path** — `envPath` option lets you point the bridge at a non-default `.env` file.
- **Graceful shutdown** — SIGINT / SIGTERM close open connections cleanly (5 s force-exit timeout).
- **`maxTokens` cap** — Incoming `maxTokens` values are clamped to 8192.
- **Structured error responses** — All errors now return the appropriate HTTP status code (400 / 401 / 429 / 504 / 5xx) plus `{ error, model, elapsed_ms }`.

## [1.0.0] — 2026-03-12

Initial release.

- `POST /generate` — call Claude using your Claude Code OAuth token
- `GET /health` — check token and server status
- `createBridge()` export for embedding in your own Express server
- Standalone `server.js` / `npx claude-code-bridge` entry point
- CORS restricted to localhost by default
