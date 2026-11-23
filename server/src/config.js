import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load server/.env no matter which directory the process was started from.
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

/** Read a string env var; blank values fall back to the default. */
function str(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

/** Read a numeric env var; blank or invalid values fall back to the default. */
function num(name, fallback) {
  const raw = str(name);
  if (raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** OLLAMA_THINK accepts true/false or a level name; blank means "model default". */
function think(name) {
  const raw = str(name).toLowerCase();
  if (raw === '') return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

/**
 * Grok (xAI) and Groq are different services with near-identical names, so
 * their keys are easy to paste under the wrong variable. A key's prefix tells
 * us who issued it (xAI: "xai-", Groq: "gsk_"), so route each key to the
 * provider that can actually use it. A correctly placed key always wins.
 */
function grokAndGroqKeys() {
  const keys = { xai: '', groq: '' };
  for (const [owner, envName] of [['xai', 'XAI_API_KEY'], ['groq', 'GROQ_API_KEY']]) {
    const key = str(envName);
    if (!key) continue;
    const issuer = key.startsWith('gsk_') ? 'groq' : key.startsWith('xai-') ? 'xai' : owner;
    if (issuer === owner) {
      keys[owner] = key;
    } else {
      const [name, rightVar] = issuer === 'groq' ? ['a Groq', 'GROQ_API_KEY'] : ['an xAI', 'XAI_API_KEY'];
      console.warn(`[config] ${envName} contains ${name} key, so it is being used as ${rightVar}. Rename it in server/.env to silence this warning.`);
      keys[issuer] ||= key;
    }
  }
  return keys;
}
const providerKeys = grokAndGroqKeys();

export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/**
 * Address to listen on. Railway sets RAILWAY_* variables on every deployment;
 * there the app must accept outside connections, so a missing HOST or a
 * loopback one (e.g. copied from a local .env) becomes 0.0.0.0.
 */
function listenHost() {
  const onRailway = Boolean(
    process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT,
  );
  const host = str('HOST', onRailway ? '0.0.0.0' : '127.0.0.1');
  if (onRailway && LOOPBACK_HOSTS.has(host)) {
    console.warn(`[config] HOST=${host} would make the app unreachable on Railway, so listening on 0.0.0.0 instead.`);
    return '0.0.0.0';
  }
  return host;
}

export const config = {
  port: num('PORT', 3001),
  host: listenHost(),
  corsOrigin: str('CORS_ORIGIN'),
  // Comma-separated bearer tokens. When set, every /api route except /api/health needs one.
  accessTokens: str('ACCESS_TOKENS')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean),
  allowNoAuth: str('ALLOW_NO_AUTH').toLowerCase() === 'true',

  agent: {
    defaultProvider: str('DEFAULT_PROVIDER'),
    systemPrompt: str(
      'AGENT_SYSTEM_PROMPT',
      'You are a helpful, concise assistant. Answer clearly and use Markdown when it helps.',
    ),
    maxHistory: Math.max(1, num('AGENT_MAX_HISTORY', 40)),
  },

  ollama: {
    host: str('OLLAMA_HOST', 'http://localhost:11434').replace(/\/+$/, ''),
    model: str('OLLAMA_MODEL'),
    apiKey: str('OLLAMA_API_KEY'),
    think: think('OLLAMA_THINK'),
  },

  anthropic: {
    apiKey: str('ANTHROPIC_API_KEY'),
    model: str('ANTHROPIC_MODEL', 'claude-sonnet-5-5'),
    maxTokens: num('ANTHROPIC_MAX_TOKENS', 16000),
    effort: str('ANTHROPIC_EFFORT'),
    baseURL: str('ANTHROPIC_BASE_URL'),
  },

  openai: {
    apiKey: str('OPENAI_API_KEY'),
    model: str('OPENAI_MODEL', 'gpt-6.2-sol'),
    maxTokens: num('OPENAI_MAX_TOKENS', undefined),
    apiMode: str('OPENAI_API_MODE', 'responses').toLowerCase() === 'chat' ? 'chat' : 'responses',
    baseURL: str('OPENAI_BASE_URL'),
  },

  xai: {
    apiKey: providerKeys.xai,
    model: str('XAI_MODEL', 'grok-4.7'),
    maxTokens: num('XAI_MAX_TOKENS', undefined),
    reasoningEffort: str('XAI_REASONING_EFFORT').toLowerCase(),
    baseURL: str('XAI_BASE_URL', 'https://api.x.ai/v1').replace(/\/+$/, ''),
  },

  groq: {
    apiKey: providerKeys.groq,
    model: str('GROQ_MODEL', 'openai/gpt-oss-120b'),
    maxTokens: num('GROQ_MAX_TOKENS', undefined),
    reasoningEffort: str('GROQ_REASONING_EFFORT').toLowerCase(),
    baseURL: str('GROQ_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
  },
};
