/**
 * Embed the bridge inside your own Express server.
 * The bridge's /generate and /health routes mount under /ai.
 */

import express           from 'express';
import { createBridge }  from 'claude-code-bridge';   // npm install github:utsavbansal93/claude-code-bridge

const { app: bridgeApp } = createBridge({ verbose: false });

const server = express();
server.use(express.json());

// Mount bridge routes under /ai
server.use('/ai', bridgeApp);

// Your own routes
server.get('/', (_req, res) => res.send('My app'));

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('Bridge available at http://localhost:3000/ai/generate');
});
