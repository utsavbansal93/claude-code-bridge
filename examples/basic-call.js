/**
 * Basic example — call the bridge from any Node.js script.
 *
 * 1. Start the bridge:   npm start  (in the claude-code-bridge directory)
 * 2. Run this example:   node examples/basic-call.js
 */

const response = await fetch('http://localhost:3099/generate', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    systemPrompt: 'You are a helpful assistant. Be concise.',
    userPrompt:   'Explain recursion in one sentence.',
    model:        'claude-haiku-4-5',   // optional — overrides server default
    maxTokens:    256,                  // optional — default 1024
  }),
});

const { text, model, elapsed_ms } = await response.json();
console.log(`[${model}] (${elapsed_ms}ms)\n${text}`);
