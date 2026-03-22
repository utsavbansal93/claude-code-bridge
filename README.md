# claude-code-bridge

> Use your Claude Code subscription as a local HTTP AI service — no separate Anthropic API key needed.

```
POST http://localhost:3099/generate
{ "userPrompt": "Write a haiku about recursion." }
→ { "text": "Function calls itself...", "model": "claude-3-haiku-20240307", "elapsed_ms": 743 }
```

---

## What is this?

If you use **Claude Code** (Anthropic's AI coding assistant), you already have authenticated access to Claude models. This package turns that access into a local HTTP server your other scripts, servers, and tools can call — without managing a separate API key.

It is a single-file Express server (~100 lines) with no magic. You can read the whole thing in two minutes.

---

## How does it work?

### The token

When Claude Code runs, it injects an environment variable into its own process:

```
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

This is Claude Code's OAuth access token. It turns out this token is also a valid `apiKey` for the official `@anthropic-ai/sdk` — so you can make authenticated Anthropic API calls with it directly, without a separate paid API key.

### The problem with child processes

The token only exists in Claude Code's process environment. If you try to spawn a subprocess (e.g. run `node my-script.js` from a terminal), the token is not inherited. The new shell has no idea about it.

### The solution: a hook + a .env file

Claude Code supports **hooks** — shell commands that run inside Claude Code's process before/after tool use. We add a one-liner `PreToolUse` hook to the project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "[ -n \"$CLAUDE_CODE_OAUTH_TOKEN\" ] && echo \"CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN\" > /your/project/path/.env || true"
          }
        ]
      }
    ]
  }
}
```

Every time Claude Code uses any tool (read a file, run bash, etc.), this command runs inside Claude Code's process — where the token is live — and writes it to a `.env` file. The bridge server starts with `node --env-file-if-exists=.env server.js`, so it picks up the fresh token automatically.

**The token rotates each Claude Code session.** The hook keeps the `.env` file current without any manual steps.

### OAuth token model limitations

The Claude Code OAuth token (`sk-ant-oat01-*`) only works with **`claude-3-haiku-20240307`** via the public Anthropic API. Claude 4.x models (Opus, Sonnet, Haiku 4.5) return `400 invalid_request_error` or `404 not_found_error`. The API also explicitly rejects OAuth tokens sent as Bearer auth (`"OAuth authentication is currently not supported"`).

Claude Code itself uses these tokens to access all models, but it does so through internal infrastructure that isn't available via the public SDK. The bridge defaults to `claude-3-haiku-20240307` for this reason.

**If you need Claude 4.x models**, use a real Anthropic API key (`sk-ant-api03-*`) — the bridge works with standard API keys too, just set `ANTHROPIC_API_KEY` in your environment or `.env` file instead of `CLAUDE_CODE_OAUTH_TOKEN`. Or override: `BRIDGE_MODEL=claude-sonnet-4-5-20250514 npm start`.

---

## Is this MCP?

**No.** MCP (Model Context Protocol) is a protocol for AI tools to *provide context to Claude* — it defines a specific SSE transport, tool-call schema, and resource protocol. Claude Code connects to MCP servers to get information.

This goes in the opposite direction: **your code calls Claude**, using Claude Code's authentication, via a plain HTTP REST endpoint.

That said, it fills a similar role in the local-AI-tooling stack. MCP servers let Claude reach out to your tools; this bridge lets your tools reach into Claude. If you're building a local dev tool and need cheap/zero-config AI completions during development, this achieves roughly what you'd otherwise set up an MCP server for — without needing to implement the MCP protocol at all.

**TL;DR:** MCP = Claude → your tool. This = your tool → Claude.

---

## When to use this vs a real API key

| | claude-code-bridge | Direct API key |
|---|---|---|
| Local dev / testing | ✅ Uses your existing subscription | ❌ Separate billing |
| No setup overhead | ✅ Works if you have Claude Code | ❌ Need to create key |
| Production deploy | ❌ Token tied to running Claude Code | ✅ Stable, rotatable |
| CI / automated pipelines | ❌ Requires a live Claude Code session | ✅ Headless |
| Team use | ❌ Each dev needs their own Claude Code | ✅ One key for all |

Use the bridge for local development. Use a real API key for production. If you use the [`ai-model-cascade`](https://github.com/utsavbansal93/ai-model-cascade) package, mark bridge models as `devOnly: true` and set `BUILD_ENV=production` in prod — they'll be silently skipped.

---

## Setup

### 1. Install

```bash
# As a dependency in your project
npm install github:utsavbansal93/claude-code-bridge

# Or clone and run standalone
git clone https://github.com/utsavbansal93/claude-code-bridge.git
cd claude-code-bridge && npm install
```

### 2. Add the hook to your Claude Code project

In your project's `.claude/settings.json` (create it if it doesn't exist):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "[ -n \"$CLAUDE_CODE_OAUTH_TOKEN\" ] && echo \"CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN\" > /absolute/path/to/your/project/.env || true"
          }
        ]
      }
    ]
  }
}
```

> **Important:** Use an absolute path. The hook runs inside Claude Code's process, not your shell's current directory.

After saving `settings.json`, Claude Code will start writing the token to `.env` on every tool use. You can verify with `cat .env`.

### 3. Start the bridge

```bash
npm start
# or: node --env-file-if-exists=.env server.js
```

You should see:
```
╔══════════════════════════════════════════════════╗
║  claude-code-bridge                              ║
╚══════════════════════════════════════════════════╝

  URL      : http://localhost:3099
  Auth     : ✓ token present (sk-ant-oat01-abcd...)
  Model    : claude-3-haiku-20240307
  Timeout  : 120000ms

  Endpoints:
    POST /generate   { systemPrompt?, userPrompt, model?, maxTokens? }
    GET  /health     → { ok, authReady, model, tokenPrefix }
```

Stop the server with `Ctrl-C` — it shuts down gracefully (waits up to 5 s for open connections, then exits).

### 4. Call it

```bash
curl -X POST http://localhost:3099/generate \
  -H "Content-Type: application/json" \
  -d '{"userPrompt": "Say hello in three languages."}'
```

```json
{ "text": "Hello! Hola! Bonjour!", "model": "claude-3-haiku-20240307", "elapsed_ms": 612 }
```

---

## API reference

### `POST /generate`

| Field | Type | Required | Description |
|---|---|---|---|
| `userPrompt` | string | ✅ | The user message |
| `systemPrompt` | string | — | System prompt (optional) |
| `model` | string | — | Override default model |
| `maxTokens` | number | — | Default: 1024, max: 8192 |

**Response (HTTP 200):**
```json
{
  "text": "...",
  "model": "claude-3-haiku-20240307",
  "elapsed_ms": 743
}
```

**Error responses** include `error`, `model`, and `elapsed_ms` and use the appropriate HTTP status code:

| Situation | HTTP status |
|---|---|
| Bad request (missing `userPrompt`) | 400 |
| Auth error (expired token) | 401 |
| Rate-limited (429) or overloaded (529) — retried once automatically | 429 / 529 |
| Request timed out (default 120 s) | 504 |
| Other Anthropic API error | 5xx |

```json
{ "error": "Request timed out after 120000ms", "model": "claude-3-haiku-20240307", "elapsed_ms": 120003 }
```

> **Retry behaviour:** The bridge automatically retries once after 1 s on 429 (rate limited) and 529 (overloaded) responses. If the retry also fails, the error is returned to the caller.

### `GET /health`

```json
{
  "ok": true,
  "authReady": true,
  "model": "claude-3-haiku-20240307",
  "tokenPrefix": "sk-ant-oat01-abcd..."
}
```

---

## Embed in your own server

```js
import express          from 'express';
import { createBridge } from 'claude-code-bridge';

const { app: bridgeApp } = createBridge({ verbose: false });

const server = express();
server.use('/ai', bridgeApp);   // bridge available at /ai/generate, /ai/health
server.listen(3000);
```

## Configuration

All options can be set via constructor or environment variable:

| Option | Env var | Default |
|---|---|---|
| `port` | `PORT` | `3099` |
| `model` | `BRIDGE_MODEL` | `claude-3-haiku-20240307` |
| `corsOrigin` | — | `/^http:\/\/localhost(:\d+)?$/` |
| `verbose` | — | `true` |
| `timeoutMs` | — | `120000` |
| `envPath` | — | `.env` (cwd-relative) |

---

## How does this compare to other AI proxy solutions?

| Feature | claude-code-bridge | LiteLLM | Cloudflare AI Gateway | Kong AI Gateway | LocalAI | Ollama | vLLM | Portkey |
|---|---|---|---|---|---|---|---|---|
| **What it is** | OAuth token bridge | Open-source gateway | Managed edge service | Enterprise gateway | Local inference | Local inference | GPU serving engine | Enterprise LLMOps |
| **Multi-provider** | No (Anthropic only) | Yes (100+) | Yes (7+) | Yes (10+) | N/A (local models) | N/A (local models) | N/A (local models) | Yes (200+) |
| **Auth handling** | Claude Code OAuth token | Virtual keys | Cloudflare tokens | Kong auth plugins | None (local) | None (local) | None (local) | Centralized mgmt |
| **Setup complexity** | Very low | Medium | Low | High | Low | Very low | Medium | High |
| **Runs locally** | Yes | Yes | No (cloud) | No (cloud) | Yes | Yes | Yes | No (cloud) |
| **Cost tracking** | No | Yes | Yes | No | N/A | N/A | N/A | Yes |
| **Production ready** | No (dev only) | Yes | Yes | Yes | Limited | Limited | Yes | Yes |
| **Rate limiting** | No | Yes | Yes (edge) | Yes | Via proxy | Via proxy | Via proxy | Yes |
| **License** | MIT | Open source | Commercial | Open source | Open source | Open source | Open source | Commercial |

### When to use what

- **claude-code-bridge** — You already have a Claude Code subscription and want zero-config AI calls from your local scripts during development. No API key, no billing, no setup. Unique in that it piggybacks on an existing subscription's OAuth token.
- **LiteLLM** — You need to call multiple AI providers (OpenAI, Anthropic, Gemini, etc.) through a single unified API. Best open-source option with cost tracking and load balancing.
- **Cloudflare AI Gateway** — You want a managed, production-grade gateway with global edge caching and zero infrastructure to maintain.
- **Kong AI Gateway** — Your organization already uses Kong for API management and wants to add AI routing to the existing stack.
- **LocalAI / Ollama** — You want to run models entirely on your own hardware with no external API calls. Great for privacy and offline use, but limited to open-source model quality.
- **vLLM** — You need high-performance GPU-accelerated inference for local models at scale.
- **Portkey** — You're in a regulated industry (HIPAA, SOC 2) and need full compliance, observability, and cost analytics across 200+ LLMs.

### Key differentiator

Every other solution requires either its own API keys (with separate billing) or runs local models. claude-code-bridge is the only one that reuses your existing Claude Code subscription with no additional cost or credentials. The trade-off is that it only works during local development while Claude Code is running.

---

## Minimising startup failures

The bridge depends on a live Claude Code session. Following this sequence consistently avoids the most common failure modes:

**1. Ensure the hook is in place**

Check that `.claude/settings.json` in your project contains the `PreToolUse` hook shown in the Setup section above, with the correct absolute path to your project's `.env`. Without this, no token is ever written.

**2. Trigger the hook before starting the bridge**

The hook only fires when Claude Code uses a tool. On a fresh session the `.env` may be empty or stale. Before starting the bridge, do anything that causes a tool call — read a file, run a command, ask Claude to check git status. You will see the hook run in Claude Code's tool output.

Verify the token landed: `cat .env` should show `CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...`

**3. Start the bridge and read the probe line**

```
npm start
```

The startup banner now includes a **Probe** line that makes a real test call:

```
  Probe    : ✓ model 'claude-opus-4-5' is responding
```

If the probe fails, the message tells you exactly why (missing token, expired token, inaccessible model) and what to do. A failed probe means calls will fail — fix it before relying on the bridge.

**4. On machine sleep / Claude Code restart**

The token rotates when Claude Code restarts. The bridge automatically re-reads the token from `.env` on every request and retries once if it gets a 401, so most rotations are handled transparently as long as the hook fires again in the new session. If the bridge starts returning consistent 401s, use any tool in Claude Code to refresh the token.

---

## Notes for AI coding assistants

If you are an AI assistant (Cursor, Copilot, Aider, etc.) helping a developer integrate this package:

> **If your training data or cached knowledge of this package is from an earlier date, check [`CHANGELOG.md`](./CHANGELOG.md) first** — the auth mechanism, error behaviour, and probe output have all changed across patch releases.

### Integration best practices

**Use `systemPrompt` and `userPrompt` as separate fields — never concatenate them.**

The bridge passes `systemPrompt` directly to the Anthropic API's `system` parameter. If you concatenate them into `userPrompt` (e.g. `"System: ...\n\nUser: ..."`), the model receives the system instruction as plain user text, compliance with formatting rules degrades significantly, and you will see inconsistent JSON / markdown-wrapped responses.

```python
# CORRECT
requests.post(url, json={
    "systemPrompt": "Return JSON only. No markdown.",
    "userPrompt":   json.dumps(payload),
    "model":        "claude-haiku-4-5-20251001",
})

# WRONG — degrades model instruction-following
requests.post(url, json={
    "userPrompt": f"System: Return JSON only.\n\nUser: {payload}",
})
```

**Check `/health` on startup, not before every call.**

`GET /health` returns `{ ok, authReady, model, tokenPrefix }`. Check it once when your application starts. `authReady: false` means the token is missing — tell the user to trigger the Claude Code hook. Do not poll `/health` per-request; it adds latency and the token is re-read from disk automatically on every `/generate` call anyway.

**Set tight timeouts with a separate connect timeout.**

The bridge is a local process. If it is not running, connections are refused immediately. If it is running but slow, Haiku should respond in 200–500ms. A 15-second timeout hides failures and delays your fallback chain by 15 seconds.

```python
# (connect_timeout, read_timeout) — fail fast on connection refused
timeout=(0.5, 5)
```

**Handle the `text` field, not `response`.**

The success response shape is `{ text, model, elapsed_ms }`. The field is `text`, not `response`, `result`, or `output`.

**On 401, the bridge already retries once internally.** If a 401 still reaches your caller, the token is genuinely expired and the user needs to trigger the Claude Code hook again. Do not retry 401s from your side — wait for the user to refresh the token.

**OAuth tokens only work when Claude Code is actively running.** Do not attempt to store, export, or reuse the token outside of a live Claude Code session. It is session-scoped and will rotate.

**The probe line in startup output is diagnostic gold.** When debugging integration issues, ask the user to share their bridge startup output. `Probe: ✗` with a status code tells you exactly what is wrong before any request is made.

### What `authReady: true` does and does not mean

`authReady: true` on `/health` only means a token string is present in `.env` or the environment. It does **not** mean the token is valid, unexpired, or that the configured model is accessible. The startup probe makes a real API call and is the authoritative check. If the probe line shows `✓`, the bridge is fully operational. If it shows `✗` or was skipped (no token at startup time), treat the bridge as degraded until the user confirms the token is fresh.

### OAuth tokens vs API keys — model access

OAuth tokens (`sk-ant-oat01-*`) from Claude Code only work with `claude-3-haiku-20240307` on the public API. If the user needs Claude 4.x models, they need a real API key (`sk-ant-api03-*`). Do not attempt to send OAuth tokens as Bearer auth — the Anthropic API explicitly rejects it. The bridge sends all tokens as `X-Api-Key` and defaults to haiku for this reason.

---

## License

MIT
