/** An error with an HTTP status that is safe to show to the user. */
export class AppError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

/** True when the error came from an AbortController (user pressed Stop / closed the tab). */
export function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    err?.name === 'APIUserAbortError' ||
    err?.constructor?.name === 'APIUserAbortError'
  );
}

/**
 * Turn any thrown value (SDK error, fetch error, AppError...) into
 * { status, message } that we can return to the browser.
 */
export function normalizeError(err, providerLabel = 'The provider') {
  if (err instanceof AppError) return { status: err.status, message: err.message };

  // Network failures (Ollama not running, DNS, proxy...)
  if (err?.name === 'TimeoutError') {
    return { status: 504, message: `${providerLabel} did not respond in time.` };
  }
  const isFetchFailure = err?.name === 'TypeError' && err?.message === 'fetch failed';
  const isSdkConnection = ['APIConnectionError', 'APIConnectionTimeoutError'].includes(err?.constructor?.name);
  if (isFetchFailure || isSdkConnection) {
    const reason = err?.cause?.code || err?.cause?.message || err?.message;
    return { status: 502, message: `Could not reach ${providerLabel} (${reason}). Is it running and is the URL correct?` };
  }

  // Anthropic / OpenAI SDK API errors carry .status and a parsed body in .error
  const status = Number.isInteger(err?.status) ? err.status : 500;
  const detail =
    err?.error?.error?.message || // Anthropic: { type: 'error', error: { message } }
    err?.error?.message || //        OpenAI:    { message, type, code }
    (typeof err?.error === 'string' && err.error) || // xAI and some compatible servers: { error: "..." }
    err?.message ||
    'Unknown error';

  if (status === 401 || status === 403) {
    return { status, message: `${providerLabel} rejected the API key (${status}). ${detail}` };
  }
  if (status === 404) {
    return { status, message: `${providerLabel}: model or endpoint not found. ${detail}` };
  }
  if (status === 429) {
    return { status, message: `${providerLabel} rate limit or quota reached. ${detail}` };
  }
  return { status, message: status >= 500 ? `${providerLabel} error: ${detail}` : detail };
}
