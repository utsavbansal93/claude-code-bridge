#!/usr/bin/env node
/**
 * Standalone entry point.
 * Run directly:  node --env-file-if-exists=.env server.js
 * Or via npm:    npm start
 * Or via npx:    npx claude-code-bridge
 */
import { createBridge } from './index.js';

const { start } = createBridge();
const server = await start();

// ── Graceful shutdown ──────────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[bridge] ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('[bridge] All connections closed. Goodbye.');
    process.exit(0);
  });

  // Force exit after 5 seconds if connections don't close
  setTimeout(() => {
    console.error('[bridge] Forced shutdown after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
