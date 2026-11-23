import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Client credentials for platforms (e.g. Signet) without any storage: a
 * client's secret is an HMAC of its id under CLIENT_SIGNING_KEY, so the server
 * can check it at any time and it survives redeploys. Access tokens from the
 * OAuth token endpoint are signed the same way and expire after an hour.
 *
 * Revoke one client: add its id to REVOKED_CLIENT_IDS.
 * Revoke all of them: change CLIENT_SIGNING_KEY.
 */

export const TOKEN_TTL_SECONDS = 3600;
const CLIENT_ID_PATTERN = /^ba_[a-z0-9-]{1,32}_[0-9a-f]{8}$/;

export const clientCredentialsEnabled = () => Boolean(config.clientSigningKey);

function sign(purpose, value) {
  return crypto.createHmac('sha256', config.clientSigningKey).update(`${purpose}:${value}`).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** New credentials for a platform. The id embeds a readable name and a random part. */
export function createClient(name) {
  const slug =
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'client';
  const clientId = `ba_${slug}_${crypto.randomBytes(4).toString('hex')}`;
  const clientSecret = sign('client-secret', clientId);
  // Single-string form for platforms that only take an "API key".
  return { clientId, clientSecret, apiKey: `${clientId}.${clientSecret}` };
}

export function verifyClient(clientId, clientSecret) {
  if (!clientCredentialsEnabled() || typeof clientId !== 'string' || typeof clientSecret !== 'string') return false;
  if (!CLIENT_ID_PATTERN.test(clientId) || config.revokedClientIds.has(clientId)) return false;
  return safeEqual(sign('client-secret', clientId), clientSecret);
}

/** "clientId.clientSecret" API keys -> clientId, or null. */
export function verifyApiKey(key) {
  const dot = key.indexOf('.');
  if (dot <= 0) return null;
  const clientId = key.slice(0, dot);
  return verifyClient(clientId, key.slice(dot + 1)) ? clientId : null;
}

/** OAuth 2.0 token response for a verified client. */
export function issueAccessToken(clientId) {
  const payload = Buffer.from(
    JSON.stringify({ sub: clientId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS }),
  ).toString('base64url');
  return {
    access_token: `bat.${payload}.${sign('access-token', payload)}`,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
  };
}

/** Access token from issueAccessToken -> clientId, or null when invalid, expired or revoked. */
export function verifyAccessToken(token) {
  if (!clientCredentialsEnabled()) return null;
  const [prefix, payload, signature, extra] = token.split('.');
  if (prefix !== 'bat' || !payload || !signature || extra !== undefined) return null;
  if (!safeEqual(sign('access-token', payload), signature)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof sub !== 'string' || !(exp > Date.now() / 1000) || config.revokedClientIds.has(sub)) return null;
    return sub;
  } catch {
    return null;
  }
}

/** Client id/secret from `Authorization: Basic base64(id:secret)` (RFC 6749 §2.3.1), or null. */
export function basicCredentials(req) {
  const match = /^Basic\s+(\S+)$/i.exec(req.get('authorization') || '');
  if (!match) return null;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon < 0) return null;
  try {
    return { id: decodeURIComponent(decoded.slice(0, colon)), secret: decodeURIComponent(decoded.slice(colon + 1)) };
  } catch {
    return null;
  }
}
