import OpenAI from 'openai';
import { config } from '../config.js';
import { AppError } from '../errors.js';

const cfg = config.openai;
let client;

function getClient() {
  if (!cfg.apiKey) {
    throw new AppError('OpenAI is not configured: set OPENAI_API_KEY in server/.env and restart the server.', 400);
  }
  client ??= new OpenAI({ apiKey: cfg.apiKey, ...(cfg.baseURL && { baseURL: cfg.baseURL }) });
  return client;
}

// /v1/models on api.openai.com also returns embedding, audio, image and
// moderation models. Hide those so the dropdown only shows chat models.
const CHAT_MODEL = /^(gpt-|o\d|chatgpt-|chat-latest)/;
const NOT_CHAT = /(embedding|audio|realtime|tts|transcribe|whisper|image|dall-e|moderation|search|davinci|babbage)/;

/** OpenAI Responses API (recommended by OpenAI for new projects). */
async function* streamResponses({ model, system, messages, temperature, signal }) {
  const params = {
    model,
    input: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    store: false,
  };
  if (system) params.instructions = system;
  // Reasoning models reject custom temperature, so only send it when set.
  if (temperature != null) params.temperature = temperature;
  if (cfg.maxTokens) params.max_output_tokens = cfg.maxTokens;

  const stream = await getClient().responses.create(params, { signal });

  let usage;
  let stopReason = 'completed';
  for await (const event of stream) {
    switch (event.type) {
      case 'response.output_text.delta':
        yield { type: 'text', text: event.delta };
        break;
      case 'response.completed':
        usage = event.response?.usage;
        break;
      case 'response.incomplete':
        usage = event.response?.usage;
        stopReason = event.response?.incomplete_details?.reason || 'incomplete';
        break;
      case 'response.failed':
        throw new AppError(event.response?.error?.message || 'OpenAI response failed', 502);
      case 'error':
        throw new AppError(event.message || 'OpenAI stream error', 502);
      default:
        break;
    }
  }

  yield {
    type: 'done',
    stopReason,
    usage: { inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens },
  };
}

/** Chat Completions API: for OpenAI-compatible servers (OpenRouter, Groq, LM Studio, vLLM...). */
async function* streamChatCompletions({ model, system, messages, temperature, signal }) {
  const params = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    stream: true,
  };
  if (temperature != null) params.temperature = temperature;
  if (cfg.maxTokens) params.max_completion_tokens = cfg.maxTokens;

  const stream = await getClient().chat.completions.create(params, { signal });

  let stopReason;
  let usage;
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) yield { type: 'text', text: choice.delta.content };
    if (choice?.finish_reason) stopReason = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }

  yield {
    type: 'done',
    stopReason,
    usage: { inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens },
  };
}

export const openai = {
  id: 'openai',
  label: 'OpenAI',
  requiresKey: true,
  get defaultModel() {
    return cfg.model;
  },
  isConfigured: () => Boolean(cfg.apiKey),

  async listModels() {
    const ids = [];
    for await (const model of getClient().models.list()) ids.push(model.id);
    // Custom base URLs (OpenRouter, LM Studio...) use their own naming, so don't filter.
    const filtered = cfg.baseURL ? ids : ids.filter((id) => CHAT_MODEL.test(id) && !NOT_CHAT.test(id));
    return filtered.sort();
  },

  stream(args) {
    return cfg.apiMode === 'chat' ? streamChatCompletions(args) : streamResponses(args);
  },
};
