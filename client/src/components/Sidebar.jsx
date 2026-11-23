import { useState } from 'react';

function providerStatus(p) {
  if (!p) return { tone: 'muted', text: '' };
  if (p.requiresKey && !p.configured) return { tone: 'warn', text: 'No API key' };
  if (p.reachable === false) return { tone: 'warn', text: 'Not running' };
  return { tone: 'ok', text: 'Ready' };
}

const SETUP_HINTS = {
  anthropic: 'Add ANTHROPIC_API_KEY to server/.env, then restart the server.',
  openai: 'Add OPENAI_API_KEY to server/.env, then restart the server.',
  grok: 'Add XAI_API_KEY to server/.env (get one at console.x.ai), then restart the server.',
  groq: 'Add GROQ_API_KEY to server/.env (get one at console.groq.com), then restart the server.',
  ollama: 'Start Ollama (`ollama serve`) and pull a model, e.g. `ollama pull llama3.2`.',
};

export default function Sidebar({
  open,
  onClose,
  info,
  infoError,
  provider,
  onProviderChange,
  model,
  defaultModel,
  onModelChange,
  modelList,
  onRefresh,
  system,
  defaultSystem,
  onSystemChange,
  temperature,
  onTemperatureChange,
}) {
  const [customModel, setCustomModel] = useState(false);
  const current = info?.providers.find((p) => p.id === provider);
  const status = providerStatus(current);
  const hasList = modelList.models.length > 0;
  // Keep a manually typed model visible even if it is not in the fetched list.
  const options = model && !modelList.models.includes(model) ? [model, ...modelList.models] : modelList.models;

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Settings">
      <div className="sidebar-head">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Settings
        </span>
        <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
      </div>

      {infoError && <p className="alert">{infoError}</p>}

      <div className="field">
        <label htmlFor="provider">Provider</label>
        <div className="row">
          <select id="provider" value={provider} onChange={(e) => onProviderChange(e.target.value)} disabled={!info}>
            {info?.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {providerStatus(p).tone === 'warn' ? ` — ${providerStatus(p).text.toLowerCase()}` : ''}
              </option>
            ))}
          </select>
          <span className={`status-dot ${status.tone}`} title={status.text} />
        </div>
        {status.tone === 'warn' && <p className="hint warn">{SETUP_HINTS[provider]}</p>}
      </div>

      <div className="field">
        <div className="label-row">
          <label htmlFor="model">Model</label>
          <button type="button" className="link-button" onClick={onRefresh} disabled={modelList.loading}>
            {modelList.loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {hasList && !customModel ? (
          <select id="model" value={model} onChange={(e) => onModelChange(e.target.value)}>
            <option value="">Default{defaultModel ? ` (${defaultModel})` : ''}</option>
            {options.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="model"
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value.trim())}
            placeholder={defaultModel || 'Model id, e.g. llama3.2'}
            spellCheck={false}
          />
        )}

        {hasList && (
          <button type="button" className="link-button small" onClick={() => setCustomModel((v) => !v)}>
            {customModel ? 'Pick from list' : 'Type a model id instead'}
          </button>
        )}
        {modelList.error && <p className="hint warn">Couldn’t load models: {modelList.error}</p>}
      </div>

      <div className="field">
        <label htmlFor="system">System prompt</label>
        <textarea
          id="system"
          rows={6}
          value={system}
          onChange={(e) => onSystemChange(e.target.value)}
          placeholder={defaultSystem || 'You are a helpful assistant.'}
        />
        <p className="hint">Leave blank to use the server default.</p>
      </div>

      <div className="field">
        <label htmlFor="temperature">Temperature</label>
        <input
          id="temperature"
          type="number"
          min="0"
          max="2"
          step="0.1"
          value={temperature}
          onChange={(e) => onTemperatureChange(e.target.value)}
          placeholder="Model default"
        />
        <p className="hint">Leave blank unless you need it — some models (Claude Opus 5.5, OpenAI reasoning models) reject custom values.</p>
      </div>

      <p className="sidebar-foot">API keys stay on the server and are never sent to the browser.</p>
    </aside>
  );
}
