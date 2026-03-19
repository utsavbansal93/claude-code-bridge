# Changelog

## [1.0.2] — 2026-03-20

### Fixed
- **Default model changed to `claude-3-haiku-20240307`** — OAuth tokens (`sk-ant-oat01-*`) are restricted by Anthropic to this model. The previous default (`claude-opus-4-5`) returned `400 invalid_request_error` on every `/generate` call, making the bridge silently broken out of the box.
- **Better 400/404 error messages** — When an API call fails with 400 or 404 and an OAuth token is in use, the error message now explicitly explains that OAuth tokens only work with `claude-3-haiku-20240307` and suggests either setting `BRIDGE_MODEL` or switching to a real `ANTHROPIC_API_KEY`.

### Docs
- Added **OAuth model constraints** section to README explaining which models work with OAuth tokens vs API keys.
- Updated all README examples and defaults to reflect `claude-3-haiku-20240307`.
- Added note for AI coding assistants about the OAuth model limitation.

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
