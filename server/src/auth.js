import crypto from 'node:crypto';
import { config, LOOPBACK_HOSTS } from './config.js';
import { basicCredentials, verifyAccessToken, verifyApiKey, verifyClient } from './credentials.js';

const MIN_TOKEN_LENGTH = 16;
const MIN_SIGNING_KEY_LENGTH = 32;
const GENERATE_HINT =
  'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))"';

const digest = (value) => crypto.createHash('sha256').update(value).digest();
const tokenDigests = config.accessTokens.map(digest);

/**
 * Returns why it would be unsafe to start the server, or null when it is fine.
 * A public HOST without access tokens would let anyone spend your API keys.
 */
export function authConfigProblem() {
  if (config.accessTokens.some((t) => /[<>]/.test(t))) {
    return `ACCESS_TOKENS still contains a placeholder such as <token-1>. Replace each one with a real token. ${GENERATE_HINT}`;
  }
  if (config.accessTokens.some((t) => t.length < MIN_TOKEN_LENGTH)) {
    return `every ACCESS_TOKENS entry must be at least ${MIN_TOKEN_LENGTH} characters. ${GENERATE_HINT}`;
  }
  if (config.clientSigningKey && (/[<>]/.test(config.clientSigningKey) || config.clientSigningKey.length < MIN_SIGNING_KEY_LENGTH)) {
    return `CLIENT_SIGNING_KEY must be a random value of at least ${MIN_SIGNING_KEY_LENGTH} characters. ${GENERATE_HINT}`;
  }
  if (!LOOPBACK_HOSTS.has(config.host) && !config.accessTokens.length && !config.allowNoAuth) {
    return (
      `HOST=${config.host} makes the API reachable from other machines, but ACCESS_TOKENS is empty, ` +
      `so anyone could use your API keys. Set ACCESS_TOKENS (${GENERATE_HINT}), ` +
      'or set ALLOW_NO_AUTH=true if your own auth already protects this server.'
    );
  }
  return null;
}

/**
 * The token a client presented. Platforms differ in how they send an API key,
 * so accept `Authorization: Bearer <token>`, `X-API-Key: <token>`, or a bare
 * `Authorization: <token>`.
 */
function presentedToken(req) {
  const authorization = (req.get('authorization') || '').trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization);
  if (bearer) return bearer[1].trim();
  const apiKey = (req.get('x-api-key') || '').trim();
  if (apiKey) return apiKey;
  return authorization && !/\s/.test(authorization) ? authorization : '';
}

function isAccessToken(token) {
  // Compare fixed-length hashes in constant time so timing doesn't reveal how much of a token matched.
  const given = digest(token);
  return tokenDigests.some((d) => crypto.timingSafeEqual(d, given));
}

/**
 * Who is calling:
 *   { kind: 'token' }              one of ACCESS_TOKENS (you, the admin)
 *   { kind: 'client', clientId }   credentials made in the UI: API key, OAuth access
 *                                  token, Basic client_id:client_secret, or
 *                                  X-Client-Id + X-Client-Secret headers
 *   null                           not allowed
 */
function identify(req) {
  const token = presentedToken(req);
  if (token) {
    if (isAccessToken(token)) return { kind: 'token' };
    const clientId = verifyApiKey(token) ?? verifyAccessToken(token);
    if (clientId) return { kind: 'client', clientId };
  }
  const pair = basicCredentials(req) ?? { id: req.get('x-client-id'), secret: req.get('x-client-secret') };
  if (verifyClient(pair.id, pair.secret)) return { kind: 'client', clientId: pair.id };
  return null;
}

/** Express middleware: when ACCESS_TOKENS is set, require a valid caller and record it in req.auth. */
export function requireAccessToken(req, res, next) {
  if (!tokenDigests.length) {
    req.auth = { kind: 'open' };
    return next();
  }
  const auth = identify(req);
  if (auth) {
    req.auth = auth;
    return next();
  }
  res.status(401).json({
    error:
      'Missing or invalid credentials. Send "Authorization: Bearer <token or API key>", "X-API-Key: <key>", ' +
      'or a Client ID and Secret (Basic auth, or an access token from /api/oauth/token).',
  });
}
