# Changelog

## [1.0.4] — 2026-03-22

### Fixed
- **OAuth Bearer auth actually works now** — `new Anthropic({ authToken })` always threw "Could not resolve authentication method" due to a header key casing bug in the installed SDK version: `bearerAuth()` returns `'Authorization'` (capital A) but `validateHeaders()` checks `'authorization'` (lowercase), so they never matched. Fixed by setting the `Authorization` header directly via `defaultHeaders` and using `x-api-key: null` (the SDK's own escape hatch to skip auth header validation). This is the real fix for Claude 4.x model access with OAuth tokens.

## [1.0.3] — 2026-03-22

### Added
- **Startup model probe** — after the server binds, `start()` makes a real `max_tokens: 1` test call and prints `Probe: ✓` or `Probe: ✗` with an actionable message (missing token, expired token, inaccessible model). This surfaces misconfiguration immediately rather than silently failing on the first real request.
- **401 auto-retry** — on an auth failure mid-session (token rotated between calls), the bridge busts its client cache, re-reads the token from disk, and retries the request once automatically. Callers no longer need to handle token rotation themselves for short-lived rotations.

### Docs
- Added **"Minimising startup failures"** section to README: the recommended session startup sequence (hook → trigger → probe → verify) that avoids the most common failure modes.
- Expanded **"Notes for AI coding assistants"** with concrete best practices: use `systemPrompt` separately (not concatenated into `userPrompt`), set split connect/read timeouts, handle the `text` field correctly, and understand what `authReady: true` does and does not mean.

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
