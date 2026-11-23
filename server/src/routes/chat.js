import { Router } from 'express';
import { runAgent } from '../agent.js';
import { isAbortError, normalizeError } from '../errors.js';
import { providers } from '../providers/index.js';

export const chatRouter = Router();

const HEARTBEAT_MS = 15_000;

function labelFor(providerId) {
  return providers[providerId]?.label;
}

/**
 * POST /api/chat
 * Body: { provider?, model?, system?, temperature?, messages: [{ role, content, raw? }], stream? }
 * provider defaults to DEFAULT_PROVIDER (or the first configured one).
 *
 * stream: true (default) -> Server-Sent Events: start, delta, done, error
 * stream: false          -> JSON { provider, model, reply, stopReason, usage, raw }
 */
chatRouter.post('/chat', async (req, res) => {
  const { stream = true, provider, model, system, temperature, messages } = req.body ?? {};

  // Stop calling the model if the browser goes away (Stop button, tab closed).
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  const events = runAgent({ provider, model, system, temperature, messages, signal: controller.signal });

  if (stream === false) {
    return sendJson(res, events, provider, controller.signal);
  }
  return sendSse(res, events, provider, controller.signal);
});

async function sendJson(res, events, providerId, signal) {
  const result = { provider: providerId, model: null, reply: '' };
  try {
    for await (const event of events) {
      if (event.type === 'start') result.model = event.model;
      else if (event.type === 'text') result.reply += event.text;
      else if (event.type === 'done') Object.assign(result, { stopReason: event.stopReason, usage: event.usage, raw: event.raw });
    }
    res.json(result);
  } catch (err) {
    if (signal.aborted || isAbortError(err)) return;
    const { status, message } = normalizeError(err, labelFor(providerId));
    if (status >= 500) console.error('[chat]', err);
    res.status(status).json({ error: message });
  }
}

async function sendSse(res, events, providerId, signal) {
  let started = false;
  let heartbeat;

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const start = () => {
    started = true;
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable buffering behind nginx
    });
    res.flushHeaders();
    // Some models think silently before the first token; keep proxies from timing out.
    heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  };

  try {
    for await (const event of events) {
      if (!started) start();
      if (event.type === 'start') send('start', { provider: event.provider, model: event.model });
      else if (event.type === 'text') send('delta', { text: event.text });
      else if (event.type === 'done') send('done', { stopReason: event.stopReason, usage: event.usage, raw: event.raw });
    }
  } catch (err) {
    if (signal.aborted || isAbortError(err)) return;
    const { status, message } = normalizeError(err, labelFor(providerId));
    if (status >= 500) console.error('[chat]', err);
    // Errors before the stream opened (bad input, unknown provider) are plain JSON with a real status.
    if (!started) return res.status(status).json({ error: message });
    send('error', { status, message });
  } finally {
    clearInterval(heartbeat);
    if (started && !res.writableEnded) res.end();
  }
}
