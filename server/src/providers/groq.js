import OpenAI from 'openai';
import { config } from '../config.js';
import { AppError } from '../errors.js';

/**
 * Groq (GroqCloud, groq.com): fast inference for open models such as
 * openai/gpt-oss-120b and Llama. Not to be confused with xAI's Grok (grok.js).
 * Groq's API is OpenAI-compatible, so we reuse the `openai` SDK with
 * Chat Completions, Groq's primary endpoint (its Responses API is in beta).
 */
const cfg = config.groq;
let client;

function getClient() {
  if (!cfg.apiKey) {
    throw new AppError('Groq is not configured: set GROQ_API_KEY in server/.env and restart the server.', 400);
  }
  client ??= new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  return client;
}

// /models also returns speech-to-text (whisper), text-to-speech (orpheus, *-tts)
// and safety classifier (llama-guard, prompt-guard, safeguard) models. Hide them.
const NOT_CHAT = /(whisper|orpheus|tts|guard)/;

export const groq = {
  id: 'groq',
  label: 'Groq',
  requiresKey: true,
  get defaultModel() {
    return cfg.model;
  },
  isConfigured: () => Boolean(cfg.apiKey),

  async listModels() {
    const ids = [];
    for await (const model of getClient().models.list()) {
      if (model.active !== false) ids.push(model.id);
    }
    return ids.filter((id) => !NOT_CHAT.test(id)).sort();
  },

  /**
   * Stream a reply. Yields { type: 'text', text } chunks, then one
   * { type: 'done', stopReason, usage }.
   */
  async *stream({ model, system, messages, temperature, signal }) {
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
    // Only gpt-oss models accept reasoning_effort, so send it only when configured.
    if (cfg.reasoningEffort) params.reasoning_effort = cfg.reasoningEffort;

    const stream = await getClient().chat.completions.create(params, { signal });

    let stopReason;
    let usage;
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      // Reasoning models stream their thinking separately; only show the answer.
      if (choice?.delta?.content) yield { type: 'text', text: choice.delta.content };
      if (choice?.finish_reason) stopReason = choice.finish_reason;
      // Groq reports usage on the last chunk, under x_groq.usage (or usage).
      const chunkUsage = chunk.usage ?? chunk.x_groq?.usage;
      if (chunkUsage) usage = chunkUsage;
    }

    yield {
      type: 'done',
      stopReason,
      usage: { inputTokens: usage?.prompt_tokens, outputTokens: usage?.completion_tokens },
    };
  },
};
