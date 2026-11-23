import { config } from '../config.js';
import { AppError } from '../errors.js';
import { anthropic } from './anthropic.js';
import { grok } from './grok.js';
import { groq } from './groq.js';
import { ollama } from './ollama.js';
import { openai } from './openai.js';

/**
 * Every provider implements the same small interface:
 *   id, label, requiresKey, defaultModel
 *   isConfigured(): boolean
 *   listModels(): Promise<string[]>
 *   stream({ model, system, messages, temperature, signal }): AsyncIterable<
 *     { type: 'text', text } | { type: 'done', stopReason, usage, rawContent? }
 *   >
 * To add another provider, create a file with that shape and register it here.
 */
export const providers = { ollama, anthropic, openai, grok, groq };

export function getProvider(id) {
  const provider = providers[id];
  if (!provider) {
    throw new AppError(`Unknown provider "${id}". Use one of: ${Object.keys(providers).join(', ')}.`, 400);
  }
  return provider;
}

/** Provider chosen by default in the UI. */
export function defaultProviderId() {
  const wanted = config.agent.defaultProvider;
  if (wanted && providers[wanted]) return wanted;
  // Prefer a hosted provider that has a key; otherwise fall back to local Ollama.
  return ['anthropic', 'openai', 'grok', 'groq'].find((id) => providers[id].isConfigured()) || 'ollama';
}

/** Summary of every provider for the frontend. */
export async function describeProviders() {
  return Promise.all(
    Object.values(providers).map(async (p) => ({
      id: p.id,
      label: p.label,
      requiresKey: p.requiresKey,
      configured: p.isConfigured(),
      // Ollama has no key, so report whether the server is reachable instead.
      reachable: typeof p.ping === 'function' ? await p.ping() : undefined,
      defaultModel: p.defaultModel || null,
    })),
  );
}
