// Thin client for the Express API.

const TOKEN_KEY = 'basic-agent:access-token';
let memoryToken = ''; // fallback when localStorage is unavailable (private mode, blocked storage)

/** Access token for servers started with ACCESS_TOKENS. Kept in this browser only. */
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token) {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage blocked: the token lasts until the page is reloaded.
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Throws on HTTP errors; a 401 becomes an error named 'AuthError'. */
async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    if (res.status === 401) err.name = 'AuthError';
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

/** Service info, including whether Client ID/Secret credentials are enabled. */
export async function getServiceInfo(signal) {
  return readJson(await fetch('/api', { headers: authHeaders(), signal }));
}

export async function getAgents(signal) {
  return readJson(await fetch('/api/agents', { headers: authHeaders(), signal }));
}

/** Create a Client ID/Secret (and API key) for a platform such as Signet. */
export async function createClient(name) {
  return readJson(
    await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name }),
    }),
  );
}

export async function getProviders() {
  return readJson(await fetch('/api/providers', { headers: authHeaders() }));
}

export async function getModels(providerId, signal) {
  return readJson(
    await fetch(`/api/providers/${encodeURIComponent(providerId)}/models`, { headers: authHeaders(), signal }),
  );
}

/** Parse one Server-Sent Events block ("event: x\ndata: {...}"). */
function parseSseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue; // comments are heartbeats
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.length ? { event, data: JSON.parse(data.join('\n')) } : null;
}

/**
 * POST /api/chat and stream the reply.
 * onEvent receives { event: 'start' | 'delta' | 'done' | 'error', data }.
 */
export async function streamChat(body, { signal, onEvent }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await readJson(res); // throws with the server's error message

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
      const evt = parseSseBlock(block);
      if (evt) onEvent(evt);
    }
  }
}
