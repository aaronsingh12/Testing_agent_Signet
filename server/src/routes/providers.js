import { Router } from 'express';
import { config } from '../config.js';
import { normalizeError } from '../errors.js';
import { defaultProviderId, describeProviders, getProvider } from '../providers/index.js';

export const providersRouter = Router();

// GET /api/providers -> which providers exist and whether they are ready to use
providersRouter.get('/providers', async (_req, res) => {
  res.json({
    defaultProvider: defaultProviderId(),
    systemPrompt: config.agent.systemPrompt,
    providers: await describeProviders(),
  });
});

// GET /api/providers/:id/models -> model ids available for that provider
providersRouter.get('/providers/:id/models', async (req, res) => {
  let provider;
  try {
    provider = getProvider(req.params.id);
    const models = await provider.listModels();
    res.json({ provider: provider.id, defaultModel: provider.defaultModel || models[0] || null, models });
  } catch (err) {
    const { status, message } = normalizeError(err, provider?.label);
    res.status(status).json({ error: message });
  }
});
