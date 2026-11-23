import OpenAI from 'openai';
import { config } from '../config.js';
import { AppError } from '../errors.js';

/**
 * Grok (xAI). xAI's API is OpenAI-compatible, so we reuse the official
 * `openai` SDK pointed at https://api.x.ai/v1. We use the Responses API:
 * xAI treats Chat Completions as legacy and recommends Responses for new code.
 */
const cfg = config.xai;
let client;

function getClient() {
  if (!cfg.apiKey) {
    throw new AppError('Grok is not configured: set XAI_API_KEY in server/.env and restart the server.', 400);
  }
  client ??= new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  return client;
}

// /v1/models also returns image, video and voice generation models
// (grok-imagine-*, grok-voice-*). Hide those so the dropdown only shows chat models.
const NOT_CHAT = /(imagine|image|video|voice|audio|tts|embed)/;

/** Join the answer text of a finished Responses object. */
function outputText(response) {
  return (response?.output ?? [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export const grok = {
  id: 'grok',
  label: 'Grok (xAI)',
  requiresKey: true,
  get defaultModel() {
    return cfg.model;
  },
  isConfigured: () => Boolean(cfg.apiKey),

  async listModels() {
    const ids = [];
    for await (const model of getClient().models.list()) ids.push(model.id);
    return ids.filter((id) => !NOT_CHAT.test(id)).sort();
  },

  /**
   * Stream a reply. Yields { type: 'text', text } chunks, then one
   * { type: 'done', stopReason, usage }.
   */
  async *stream({ model, system, messages, temperature, signal }) {
    const params = {
      model,
      input: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      // xAI stores requests and responses for 30 days by default. The browser
      // keeps the conversation and resends it each turn, so opt out.
      store: false,
    };
    if (system) params.instructions = system;
    // Only send sampling params when the user set them (xAI samples values above 1 at 1).
    if (temperature != null) params.temperature = temperature;
    if (cfg.maxTokens) params.max_output_tokens = cfg.maxTokens;
    if (cfg.reasoningEffort) params.reasoning = { effort: cfg.reasoningEffort };

    const stream = await getClient().responses.create(params, { signal });

    let final;
    let streamed = false;
    let stopReason = 'completed';
    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta':
          if (event.delta) {
            streamed = true;
            yield { type: 'text', text: event.delta };
          }
          break;
        case 'response.completed':
          final = event.response;
          break;
        case 'response.incomplete':
          final = event.response;
          stopReason = event.response?.incomplete_details?.reason || 'incomplete';
          break;
        case 'response.failed':
          throw new AppError(event.response?.error?.message || 'Grok response failed', 502);
        case 'error':
          throw new AppError(event.message || 'Grok stream error', 502);
        default:
          break;
      }
    }

    // Safety net: if no text deltas arrived but the final response has text,
    // show it in one piece rather than an empty reply.
    if (!streamed) {
      const text = outputText(final);
      if (text) yield { type: 'text', text };
    }

    yield {
      type: 'done',
      stopReason,
      usage: { inputTokens: final?.usage?.input_tokens, outputTokens: final?.usage?.output_tokens },
    };
  },
};
