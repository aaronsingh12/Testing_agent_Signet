import { config } from '../config.js';
import { AppError } from '../errors.js';

const cfg = config.ollama;

function headers() {
  return {
    'Content-Type': 'application/json',
    ...(cfg.apiKey && { Authorization: `Bearer ${cfg.apiKey}` }),
  };
}

/** Read Ollama's error body ({ "error": "..." }) into an AppError. */
async function toError(res) {
  const text = await res.text().catch(() => '');
  let message = text;
  try {
    message = JSON.parse(text).error || text;
  } catch {
    // body was not JSON
  }
  if (res.status === 404 && /model/i.test(message)) {
    message += ' — pull it first, e.g. `ollama pull llama3.2`.';
  }
  return new AppError(`Ollama: ${message || `HTTP ${res.status}`}`, res.status);
}

/** Ollama streams newline-delimited JSON. Yield one parsed object per line. */
async function* readNdjson(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line);
    }
  }
  const rest = (buffer + decoder.decode()).trim();
  if (rest) yield JSON.parse(rest);
}

export const ollama = {
  id: 'ollama',
  label: 'Ollama (local)',
  requiresKey: false,
  get defaultModel() {
    return cfg.model;
  },
  // No key needed. Whether Ollama is actually running is checked with ping().
  isConfigured: () => true,

  async ping() {
    try {
      const res = await fetch(`${cfg.host}/api/version`, { headers: headers(), signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels() {
    const res = await fetch(`${cfg.host}/api/tags`, { headers: headers(), signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw await toError(res);
    const data = await res.json();
    return (data.models || []).map((m) => m.name).sort();
  },

  async *stream({ model, system, messages, temperature, signal }) {
    const body = {
      model,
      stream: true,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    };
    if (temperature != null) body.options = { temperature };
    if (cfg.think !== undefined) body.think = cfg.think;

    const res = await fetch(`${cfg.host}/api/chat`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await toError(res);

    let last;
    for await (const part of readNdjson(res.body)) {
      if (part.error) throw new AppError(`Ollama: ${part.error}`, 502);
      // Thinking models put reasoning in message.thinking; we only show the answer.
      if (part.message?.content) yield { type: 'text', text: part.message.content };
      if (part.done) last = part;
    }

    yield {
      type: 'done',
      stopReason: last?.done_reason,
      usage: { inputTokens: last?.prompt_eval_count, outputTokens: last?.eval_count },
    };
  },
};
