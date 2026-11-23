import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { AppError } from '../errors.js';

const cfg = config.anthropic;
let client;

function getClient() {
  if (!cfg.apiKey) {
    throw new AppError('Claude is not configured: set ANTHROPIC_API_KEY in server/.env and restart the server.', 400);
  }
  client ??= new Anthropic({ apiKey: cfg.apiKey, ...(cfg.baseURL && { baseURL: cfg.baseURL }) });
  return client;
}

/**
 * Newer Claude models return thinking blocks that should be sent back unchanged
 * on the next turn. The frontend keeps the full content array of each reply in
 * `raw` and we replay it when the conversation stays on the same model;
 * otherwise we fall back to the plain text.
 */
function toAnthropicMessage(message, model) {
  const { raw } = message;
  if (
    message.role === 'assistant' &&
    raw?.provider === 'anthropic' &&
    raw?.model === model &&
    Array.isArray(raw.content) &&
    raw.content.length > 0
  ) {
    return { role: 'assistant', content: raw.content };
  }
  return { role: message.role, content: message.content };
}

export const anthropic = {
  id: 'anthropic',
  label: 'Claude (Anthropic)',
  requiresKey: true,
  get defaultModel() {
    return cfg.model;
  },
  isConfigured: () => Boolean(cfg.apiKey),

  async listModels() {
    const ids = [];
    for await (const model of getClient().models.list({ limit: 100 })) ids.push(model.id);
    return ids;
  },

  /**
   * Stream a reply. Yields { type: 'text', text } chunks, then one
   * { type: 'done', ... } with usage and the raw content blocks.
   */
  async *stream({ model, system, messages, temperature, signal }) {
    const params = {
      model,
      max_tokens: cfg.maxTokens,
      messages: messages.map((m) => toAnthropicMessage(m, model)),
    };
    if (system) params.system = system;
    // Only send sampling params when the user set them: some models
    // (e.g. Claude Opus 5.5) reject any non-default temperature.
    if (temperature != null) params.temperature = temperature;
    if (cfg.effort) params.output_config = { effort: cfg.effort };

    const stream = getClient().messages.stream(params, { signal });

    for await (const event of stream) {
      // Thinking blocks arrive first on newer models; we only surface answer text.
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    yield {
      type: 'done',
      stopReason: final.stop_reason,
      usage: { inputTokens: final.usage?.input_tokens, outputTokens: final.usage?.output_tokens },
      rawContent: final.content,
    };
  },
};
