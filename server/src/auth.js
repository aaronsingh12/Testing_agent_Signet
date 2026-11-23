import crypto from 'node:crypto';
import { config, LOOPBACK_HOSTS } from './config.js';

const MIN_TOKEN_LENGTH = 16;
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
 * Express middleware: when ACCESS_TOKENS is set, require
 * `Authorization: Bearer <token>` matching one of them.
 */
export function requireAccessToken(req, res, next) {
  if (!tokenDigests.length) return next();
  const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
  if (match) {
    // Compare fixed-length hashes in constant time so timing doesn't reveal how much of a token matched.
    const given = digest(match[1].trim());
    if (tokenDigests.some((d) => crypto.timingSafeEqual(d, given))) return next();
  }
  res.status(401).json({ error: 'Missing or invalid access token.' });
}
