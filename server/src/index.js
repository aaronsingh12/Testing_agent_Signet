import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { authConfigProblem, requireAccessToken } from './auth.js';
import { config } from './config.js';
import { defaultProviderId, providers } from './providers/index.js';
import { chatRouter } from './routes/chat.js';
import { providersRouter } from './routes/providers.js';

const problem = authConfigProblem();
if (problem) {
  console.error(`Refusing to start: ${problem}`);
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

if (config.corsOrigin) {
  app.use('/api', cors({ origin: config.corsOrigin.split(',').map((o) => o.trim()) }));
}

// Public on purpose: hosting platforms (e.g. Railway) call it without a token.
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', requireAccessToken);
app.use('/api', providersRouter);
app.use('/api', chatRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// In production, serve the built React app from client/dist.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Malformed JSON bodies and anything else that slipped through.
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, config.host, () => {
  const status = Object.values(providers)
    .map((p) => `${p.id}${p.requiresKey && !p.isConfigured() ? ' (no key)' : ''}`)
    .join(', ');
  console.log(`Basic Agent API listening on http://${config.host}:${config.port}`);
  console.log(`Providers: ${status} | default: ${defaultProviderId()}`);
  console.log(
    config.accessTokens.length
      ? `Access tokens: ${config.accessTokens.length} configured (API requires one)`
      : 'Access tokens: none (API is open to anyone who can reach it)',
  );
});
