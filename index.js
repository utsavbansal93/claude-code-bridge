/**
 * claude-code-bridge
 *
 * Exposes your Claude Code subscription as a local HTTP AI service.
 * No separate Anthropic API key needed — uses CLAUDE_CODE_OAUTH_TOKEN,
 * which Claude Code writes to .env automatically via a PreToolUse hook.
 *
 * Usage (embedded in your own server):
 *
 *   import { createBridge } from 'claude-code-bridge';
 *   const { app, start } = createBridge({ port: 3099, model: 'claude-haiku-4-5' });
 *   await start();
 *
 * Or use the standalone server:
 *
 *   npx claude-code-bridge          # runs on port 3099
 *   PORT=4000 npx claude-code-bridge
 *
 * API:
 *   POST /generate   { systemPrompt?, userPrompt, model?, maxTokens? }
 *                    → { text, model, elapsed_ms }
 *   GET  /health     → { ok, authReady, model, tokenPrefix }
 */

import Anthropic from '@anthropic-ai/sdk';
import express   from 'express';
import { readFileSync } from 'node:fs';
import { resolve }      from 'node:path';

const DEFAULT_MODEL      = 'claude-opus-4-5';
const DEFAULT_PORT       = 3099;
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TOKENS_LIMIT   = 8192;
const RETRY_DELAY_MS     = 1000;
const RETRYABLE_STATUSES = new Set([429, 529]);

/**
 * @param {{
 *   port?:       number,   // default 3099 (or $PORT)
 *   model?:      string,   // default 'claude-opus-4-5' (or $BRIDGE_MODEL)
 *   corsOrigin?: RegExp,   // default /^http:\/\/localhost(:\d+)?$/
 *   verbose?:    boolean,  // print startup banner, default true
 *   timeoutMs?:  number,   // API call timeout, default 120000
 *   envPath?:    string,   // path to .env file, default '.env' (cwd-relative)
 * }} [options]
 *
 * @returns {{ app: import('express').Express, start: () => Promise<import('http').Server> }}
 */
export function createBridge(options = {}) {
  const {
    port       = parseInt(process.env.PORT       ?? DEFAULT_PORT),
    model      = process.env.BRIDGE_MODEL        ?? DEFAULT_MODEL,
    corsOrigin = /^http:\/\/localhost(:\d+)?$/,
    verbose    = true,
    timeoutMs  = DEFAULT_TIMEOUT_MS,
    envPath    = resolve(process.cwd(), '.env'),
  } = options;

  // ── Token access ─────────────────────────────────────────────────────────────
  // Reads the .env file from disk on every call so token rotations are
  // picked up without restarting the server.
  function readTokenFromDisk() {
    try {
      const contents = readFileSync(envPath, 'utf8');
      const match = contents.match(/^CLAUDE_CODE_OAUTH_TOKEN=(.+)$/m);
      return match?.[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  function getToken() {
    const t = readTokenFromDisk() || process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!t) throw new Error(
      'CLAUDE_CODE_OAUTH_TOKEN is not set.\n' +
      'Make sure the Claude Code hook is writing it to .env — see README.'
    );
    return t;
  }

  // Re-create the Anthropic client whenever the token changes.
  let _cachedClient = null;
  let _cachedToken  = null;

  function getClient() {
    const token = getToken();
    if (token !== _cachedToken) {
      // OAuth tokens (sk-ant-oat01-*) must be sent as Bearer tokens via the
      // Authorization header. Passing them as apiKey (x-api-key) restricts
      // access to older models and causes 400/404 on Claude 4.x+.
      const isOAuth = token.startsWith('sk-ant-oat01-');
      _cachedClient = isOAuth
        ? new Anthropic({ authToken: token })
        : new Anthropic({ apiKey: token });
      _cachedToken  = token;
    }
    return _cachedClient;
  }

  // ── Express app ───────────────────────────────────────────────────────────────
  const app = express();
  app.use(express.json());

  // CORS — localhost only by default
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && corsOrigin.test(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // ── POST /generate ────────────────────────────────────────────────────────────
  /**
   * Body: { systemPrompt?: string, userPrompt: string, model?: string, maxTokens?: number }
   * Response: { text: string, model: string, elapsed_ms: number }
   */
  app.post('/generate', async (req, res) => {
    const { systemPrompt, userPrompt, model: reqModel, maxTokens: rawMaxTokens = 1024 } = req.body;

    if (!userPrompt || typeof userPrompt !== 'string') {
      return res.status(400).json({ error: '`userPrompt` is required and must be a string' });
    }

    if (reqModel !== undefined && (typeof reqModel !== 'string' || reqModel.trim() === '')) {
      return res.status(400).json({ error: '`model` must be a non-empty string' });
    }

    const maxTokens = Math.max(1, Math.min(MAX_TOKENS_LIMIT, Math.floor(Number(rawMaxTokens) || 1024)));
    const useModel = reqModel ?? model;
    const t0 = Date.now();

    async function attemptGenerate(signal) {
      const anthropic = getClient();
      return anthropic.messages.create({
        model:      useModel,
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: [{ role: 'user', content: userPrompt }],
      }, { signal });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let msg;
      try {
        msg = await attemptGenerate(controller.signal);
      } catch (err) {
        // Retry once for transient errors
        if (RETRYABLE_STATUSES.has(err.status) && !controller.signal.aborted) {
          if (verbose) console.log(`[bridge] ${err.status} — retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          msg = await attemptGenerate(controller.signal);
        } else {
          throw err;
        }
      } finally {
        clearTimeout(timer);
      }

      const text = msg.content[0]?.text ?? '';
      res.json({ text, model: useModel, elapsed_ms: Date.now() - t0 });

    } catch (err) {
      const status = err.name === 'AbortError' ? 504 : (err.status ?? 500);
      const message = err.name === 'AbortError'
        ? `Request timed out after ${timeoutMs}ms`
        : err.message;
      if (verbose) console.error('[bridge] /generate error:', message);
      res.status(status).json({
        error:      message,
        model:      useModel,
        elapsed_ms: Date.now() - t0,
      });
    }
  });

  // ── GET /health ───────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    const token = readTokenFromDisk() || process.env.CLAUDE_CODE_OAUTH_TOKEN;
    res.json({
      ok:          !!token,
      authReady:   !!token,
      model,
      tokenPrefix: token ? `${token.slice(0, 16)}...` : null,
    });
  });

  // ── JSON parse error handler ────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON in request body' });
    }
    if (verbose) console.error('[bridge] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ── start() ──────────────────────────────────────────────────────────────────
  function start() {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        if (verbose) {
          const token = readTokenFromDisk() || process.env.CLAUDE_CODE_OAUTH_TOKEN;
          console.log('\n╔══════════════════════════════════════════════════╗');
          console.log('║  claude-code-bridge                              ║');
          console.log('╚══════════════════════════════════════════════════╝');
          console.log(`\n  URL      : http://localhost:${port}`);
          console.log(`  Auth     : ${token
            ? `✓ token present (${token.slice(0, 16)}...)`
            : '✗ CLAUDE_CODE_OAUTH_TOKEN missing — see README'}`);
          console.log(`  Model    : ${model}`);
          console.log(`  Timeout  : ${timeoutMs}ms`);
          console.log('\n  Endpoints:');
          console.log('    POST /generate   { systemPrompt?, userPrompt, model?, maxTokens? }');
          console.log('    GET  /health     → { ok, authReady, model, tokenPrefix }\n');
        }

        resolve(server);
      });

      server.on('error', reject);
    });
  }

  return { app, start };
}
