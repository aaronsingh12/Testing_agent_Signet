import { useEffect, useState } from 'react';
import { createClient, getAgents, getServiceInfo } from '../api.js';

/** Random 32-byte base64url value, generated in the browser (never sent to the server). */
function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (non-HTTPS, permissions): fall back to a hidden textarea.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function CopyField({ label, value, secret = false, hint }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);

  const copy = async () => {
    await copyText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <div className="copy-row">
        <code className="copy-value">{shown ? value : '•'.repeat(Math.min(value.length, 28))}</code>
        {secret && (
          <button type="button" className="link-button small" onClick={() => setShown((s) => !s)}>
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
        <button type="button" className="ghost-button copy-button" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function Credentials({ info, origin, onAuthError }) {
  const [name, setName] = useState('Signet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [signingKey] = useState(randomKey);
  const cc = info.clientCredentials;

  if (!cc?.enabled) {
    return (
      <div className="connect-callout">
        <p>
          <strong>Turn on Client ID &amp; Secret.</strong> Add this variable to your server once (Railway: your service →
          Variables), then deploy. Keep it private: anyone with it can create credentials, and changing it later revokes
          every Client ID &amp; Secret made with it.
        </p>
        <CopyField label="CLIENT_SIGNING_KEY" value={signingKey} secret hint="Generated in your browser just now." />
      </div>
    );
  }

  if (!cc.canCreate) {
    return <p className="hint warn">Sign in with one of your ACCESS_TOKENS to create credentials.</p>;
  }

  const generate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setCreated(await createClient(name.trim()));
    } catch (err) {
      if (err.name === 'AuthError') onAuthError();
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="connect-form" onSubmit={generate}>
        <div className="field">
          <label htmlFor="client-name">Platform name</label>
          <input id="client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Signet" />
        </div>
        <button type="submit" className="primary-button" disabled={busy}>
          {busy ? 'Generating…' : created ? 'Generate another' : 'Generate Client ID & Secret'}
        </button>
      </form>
      {error && <p className="alert">{error}</p>}

      {created && (
        <div className="connect-result">
          <p className="hint warn">
            Copy these now: the secret is not shown again. To cut this platform off later, add its Client ID to
            REVOKED_CLIENT_IDS on the server.
          </p>
          <CopyField label="Client ID" value={created.clientId} />
          <CopyField label="Client Secret" value={created.clientSecret} secret />
          <CopyField label="Token URL" value={`${origin}${created.tokenPath}`} hint="OAuth 2.0, grant type client_credentials." />
          <CopyField
            label="API key"
            value={created.apiKey}
            secret
            hint="Same credentials as one string, for Signet's “REST API” option."
          />
        </div>
      )}
    </>
  );
}

/** "Connect" dialog: everything a platform such as Signet needs to onboard this agent. */
export default function ConnectPanel({ onClose, onAuthError }) {
  const [state, setState] = useState({ loading: true, info: null, agents: [], error: '' });
  const origin = window.location.origin;
  const baseUrl = `${origin}/api`;

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getServiceInfo(controller.signal), getAgents(controller.signal)])
      .then(([info, { agents }]) => setState({ loading: false, info, agents, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.name === 'AuthError') onAuthError();
        setState({ loading: false, info: null, agents: [], error: err.message });
      });
    return () => controller.abort();
  }, [onAuthError]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { loading, info, agents, error } = state;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="connect-title">Connect a platform</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="hint">Use these details to onboard this agent in Signet or any platform that connects over REST.</p>

        {loading && <p className="hint">Loading…</p>}
        {error && <p className="alert">{error}</p>}

        {info && (
          <>
            <section className="connect-section">
              <h3>1. Connection</h3>
              <CopyField label="Base URL" value={baseUrl} />
              <div className="copy-field">
                <span className="copy-label">Agents</span>
                {agents.length ? (
                  <ul className="agent-list">
                    {agents.map((a) => (
                      <li key={a.id}>
                        <span>
                          <strong>{a.name}</strong>
                          <span className="hint"> · {a.model || 'default model'}</span>
                        </span>
                        <code>{a.id}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint warn">No agent is ready yet: add an LLM provider key (e.g. GROQ_API_KEY) on the server.</p>
                )}
              </div>
            </section>

            <section className="connect-section">
              <h3>2. Credentials</h3>
              <Credentials info={info} origin={origin} onAuthError={onAuthError} />
            </section>

            <section className="connect-section">
              <h3>3. What goes where in Signet</h3>
              <table className="connect-table">
                <tbody>
                  <tr>
                    <th>Client ID and Client Secret</th>
                    <td>Base URL, Client ID, Client Secret, and the Token URL if asked.</td>
                  </tr>
                  <tr>
                    <th>REST API</th>
                    <td>Base URL, and the API key as “API key / secret”.</td>
                  </tr>
                </tbody>
              </table>

              <details className="connect-details">
                <summary>API settings and endpoint mapping</summary>
                <table className="connect-table">
                  <tbody>
                    <tr><th>Auth header</th><td><code>Authorization: Bearer &lt;key or token&gt;</code> (or <code>X-API-Key</code>)</td></tr>
                    <tr><th>List agents</th><td><code>GET /agents</code>, list in <code>agents</code></td></tr>
                    <tr><th>Get one agent</th><td><code>GET /agents/{'{id}'}</code></td></tr>
                    <tr><th>Agent fields</th><td><code>id</code>, <code>name</code>, <code>description</code>, <code>status</code>, <code>model</code></td></tr>
                    <tr><th>Invoke</th><td><code>POST /agents/{'{id}'}/chat</code> with <code>{'{"input": "<message>"}'}</code></td></tr>
                    <tr><th>Response text</th><td><code>reply</code></td></tr>
                    <tr><th>Token endpoint</th><td><code>POST /oauth/token</code>, grant type <code>client_credentials</code></td></tr>
                  </tbody>
                </table>
              </details>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
