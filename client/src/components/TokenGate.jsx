import { useState } from 'react';

/** Shown instead of the app when the server requires an access token (ACCESS_TOKENS is set). */
export default function TokenGate({ rejected, onSubmit }) {
  const [token, setToken] = useState('');
  const value = token.trim();

  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (value) onSubmit(value);
        }}
      >
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Basic Agent
        </span>

        <div className="field">
          <label htmlFor="access-token">Access token</label>
          <input
            id="access-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your access token"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          {rejected ? (
            <p className="hint warn">That token was not accepted. Check it and try again.</p>
          ) : (
            <p className="hint">
              This agent is private. Enter one of the tokens from the server’s ACCESS_TOKENS setting. It is saved in
              this browser only.
            </p>
          )}
        </div>

        <button type="submit" className="primary-button" disabled={!value}>
          Continue
        </button>
      </form>
    </div>
  );
}
