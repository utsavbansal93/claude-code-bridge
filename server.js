#!/usr/bin/env node
/**
 * Standalone entry point.
 * Run directly:  node --env-file-if-exists=.env server.js
 * Or via npm:    npm start
 * Or via npx:    npx claude-code-bridge
 */
import { createBridge } from './index.js';

const { start } = createBridge();
await start();
