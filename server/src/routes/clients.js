import express, { Router } from 'express';
import {
  basicCredentials,
  clientCredentialsEnabled,
  createClient,
  issueAccessToken,
  verifyClient,
} from '../credentials.js';

const NOT_ENABLED =
  'Client credentials are off: set CLIENT_SIGNING_KEY (32+ random characters) in the server variables, then redeploy.';

/**
 * POST /api/oauth/token: OAuth 2.0 client credentials grant (RFC 6749 §4.4).
 * Public on purpose: the caller authenticates with its Client ID and Secret,
 * sent as HTTP Basic auth or as client_id/client_secret in the body
 * (form-encoded, the OAuth standard, or JSON).
 */
export const oauthRouter = Router();

oauthRouter.post('/oauth/token', express.urlencoded({ extended: false }), (req, res) => {
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
  const oauthError = (status, error, description) => res.status(status).json({ error, error_description: description });

  if (!clientCredentialsEnabled()) return oauthError(400, 'unauthorized_client', NOT_ENABLED);

  const body = req.body ?? {};
  const grantType = body.grant_type ?? 'client_credentials';
  if (grantType !== 'client_credentials') {
    return oauthError(400, 'unsupported_grant_type', 'Only grant_type=client_credentials is supported.');
  }
  const client = basicCredentials(req) ?? { id: body.client_id, secret: body.client_secret };
  if (!client.id || !client.secret) {
    return oauthError(400, 'invalid_request', 'Send client_id and client_secret (Basic auth or request body).');
  }
  if (!verifyClient(client.id, client.secret)) {
    res.set('WWW-Authenticate', 'Basic realm="basic-agent"');
    return oauthError(401, 'invalid_client', 'Unknown client, wrong secret, or revoked.');
  }
  res.json(issueAccessToken(client.id));
});

/**
 * POST /api/clients { name }: create Client ID/Secret (and API key) for a
 * platform. Only an admin ACCESS_TOKENS token may do this, not a client.
 */
export const clientsRouter = Router();

clientsRouter.post('/clients', (req, res) => {
  if (req.auth?.kind === 'client') {
    return res.status(403).json({ error: 'Sign in with one of the ACCESS_TOKENS to create credentials.' });
  }
  if (!clientCredentialsEnabled()) return res.status(409).json({ error: NOT_ENABLED, code: 'signing_key_missing' });
  res.set('Cache-Control', 'no-store');
  res.status(201).json({ ...createClient(req.body?.name), tokenPath: '/api/oauth/token' });
});
