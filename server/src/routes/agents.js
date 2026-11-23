import { Router } from 'express';
import { config } from '../config.js';
import { providers } from '../providers/index.js';
import { handleChat } from './chat.js';

/**
 * Agent catalogue for platforms that discover and onboard agents over REST
 * (e.g. Signet). Each provider that can answer right now (API key set, or
 * Ollama running) is listed as its own agent, so the platform can choose
 * which ones to onboard and govern separately.
 *
 *   GET  /api                  service info (also a handy "test connection" target)
 *   GET  /api/agents           { agents: [Agent] }
 *   GET  /api/agents/:id       Agent
 *   POST /api/agents/:id/chat  { input: "text" } or { messages: [...] } -> JSON reply
 */
export const agentsRouter = Router();

const ID_PREFIX = 'basic-agent-';

async function isReady(provider) {
  if (provider.requiresKey) return provider.isConfigured();
  return typeof provider.ping === 'function' ? provider.ping() : true;
}

function describe(provider) {
  const id = `${ID_PREFIX}${provider.id}`;
  const model = provider.defaultModel || null;
  return {
    id,
    name: `Basic Agent (${provider.label})`,
    description: `General-purpose chat assistant that answers with ${provider.label}${model ? ` (${model})` : ''}.`,
    status: 'active',
    type: 'chat',
    provider: provider.id,
    model,
    instructions: config.agent.systemPrompt,
    capabilities: ['chat', 'streaming'],
    endpoint: `/api/agents/${id}/chat`,
  };
}

async function readyAgents() {
  const all = Object.values(providers);
  const ready = await Promise.all(all.map(isReady));
  return all.filter((_, i) => ready[i]).map(describe);
}

/** Agent id -> provider, or null when the id is unknown. */
function providerFor(agentId) {
  if (!agentId.startsWith(ID_PREFIX)) return null;
  return providers[agentId.slice(ID_PREFIX.length)] ?? null;
}

agentsRouter.get('/', (_req, res) => {
  res.json({
    name: 'Basic Agent',
    endpoints: { agents: '/api/agents', agent: '/api/agents/{id}', chat: '/api/agents/{id}/chat' },
  });
});

agentsRouter.get('/agents', async (_req, res) => {
  res.json({ agents: await readyAgents() });
});

agentsRouter.get('/agents/:id', async (req, res) => {
  const provider = providerFor(req.params.id);
  if (!provider || !(await isReady(provider))) {
    return res.status(404).json({ error: `Unknown or unavailable agent "${req.params.id}".` });
  }
  res.json(describe(provider));
});

// JSON by default (what REST platforms expect); send "stream": true for Server-Sent Events.
agentsRouter.post('/agents/:id/chat', (req, res) => {
  const provider = providerFor(req.params.id);
  if (!provider) return res.status(404).json({ error: `Unknown agent "${req.params.id}".` });
  return handleChat(req, res, { provider: provider.id, defaultStream: false });
});
