import { config } from './config.js';
import { AppError } from './errors.js';
import { defaultProviderId, getProvider } from './providers/index.js';

const ROLES = new Set(['user', 'assistant']);

/**
 * Validate and tidy the conversation coming from the client:
 *  - only user/assistant messages with string content
 *  - consecutive messages from the same role are merged
 *  - keep the last AGENT_MAX_HISTORY messages, starting on a user turn
 *  - must end with a user message
 */
export function prepareMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AppError('`messages` must be a non-empty array of { role, content }.', 400);
  }

  const cleaned = [];
  for (const m of messages) {
    if (!m || !ROLES.has(m.role) || typeof m.content !== 'string') {
      throw new AppError('Each message needs role "user" or "assistant" and string content.', 400);
    }
    const content = m.content.trim();
    if (!content) continue; // skip empty turns (e.g. a reply that was stopped instantly)

    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = `${prev.content}\n\n${content}`;
      delete prev.raw; // merged text no longer matches the provider's raw blocks
      continue;
    }
    cleaned.push({ role: m.role, content, ...(m.raw && { raw: m.raw }) });
  }

  let trimmed = cleaned.slice(-config.agent.maxHistory);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed = trimmed.slice(1);

  if (!trimmed.length || trimmed[trimmed.length - 1].role !== 'user') {
    throw new AppError('The last message must be from the user.', 400);
  }
  return trimmed;
}

function parseTemperature(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const t = Number(value);
  if (!Number.isFinite(t) || t < 0 || t > 2) throw new AppError('`temperature` must be a number between 0 and 2.', 400);
  return t;
}

async function resolveModel(provider, requested) {
  const model = (typeof requested === 'string' && requested.trim()) || provider.defaultModel;
  if (model) return model;
  // Ollama with no OLLAMA_MODEL: use the first installed model.
  const models = await provider.listModels();
  if (!models.length) {
    throw new AppError(`No model selected and none found for ${provider.label}. Pull one with \`ollama pull llama3.2\`.`, 400);
  }
  return models[0];
}

/**
 * The agent: takes the user's conversation, sends it to the chosen provider
 * and streams the answer back as events:
 *   { type: 'start', provider, model }
 *   { type: 'text', text }            (many)
 *   { type: 'done', stopReason, usage, raw }
 *
 * This is the place to grow the agent later (tools, memory, retrieval...).
 */
export async function* runAgent({ provider: providerId, model, system, messages, temperature, signal }) {
  // No provider given (e.g. another project calling the API): use the server's default.
  const provider = getProvider(providerId || defaultProviderId());
  if (!provider.isConfigured()) {
    throw new AppError(`${provider.label} is not configured: add its API key to server/.env and restart the server.`, 400);
  }
  const prepared = prepareMessages(messages);
  const temp = parseTemperature(temperature);
  const resolvedModel = await resolveModel(provider, model);
  const systemPrompt = (typeof system === 'string' && system.trim()) || config.agent.systemPrompt;

  yield { type: 'start', provider: provider.id, model: resolvedModel };

  for await (const event of provider.stream({
    model: resolvedModel,
    system: systemPrompt,
    messages: prepared,
    temperature: temp,
    signal,
  })) {
    if (event.type === 'done') {
      const { rawContent, ...rest } = event;
      yield {
        ...rest,
        // Opaque provider data the client stores and sends back next turn.
        raw: rawContent ? { provider: provider.id, model: resolvedModel, content: rawContent } : undefined,
      };
    } else {
      yield event;
    }
  }
}
