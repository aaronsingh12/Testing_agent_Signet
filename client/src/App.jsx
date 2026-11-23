import { useCallback, useEffect, useRef, useState } from 'react';
import { getModels, getProviders, getToken, setToken, streamChat } from './api.js';
import Composer from './components/Composer.jsx';
import MessageList from './components/MessageList.jsx';
import Sidebar from './components/Sidebar.jsx';
import TokenGate from './components/TokenGate.jsx';
import { useLocalStorage } from './useLocalStorage.js';

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const DEFAULT_SETTINGS = {
  provider: '', // blank = server default
  models: {}, // chosen model per provider; blank = provider default
  system: '', // blank = server default system prompt
  temperature: '', // blank = model default
};

const EXAMPLES = [
  'Explain how a REST API works in 5 bullet points',
  'Write a polite follow-up email for an unpaid invoice',
  'Give me a JavaScript function that debounces another function',
];

export default function App() {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState('');
  const [settings, setSettings] = useLocalStorage('basic-agent:settings', DEFAULT_SETTINGS);
  const [modelList, setModelList] = useState({ loading: false, models: [], error: '' });
  const [modelsVersion, setModelsVersion] = useState(0);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Set when the server answers 401: show the access-token screen.
  const [auth, setAuth] = useState({ needed: false, rejected: false });
  const abortRef = useRef(null);

  const requireToken = useCallback(() => setAuth({ needed: true, rejected: Boolean(getToken()) }), []);

  const providerIds = info?.providers.map((p) => p.id) ?? [];
  const provider = providerIds.includes(settings.provider) ? settings.provider : info?.defaultProvider ?? '';
  const providerInfo = info?.providers.find((p) => p.id === provider);
  const model = settings.models?.[provider] ?? '';
  const shownModel = model || providerInfo?.defaultModel || modelList.models[0] || '';

  const loadProviders = useCallback(async () => {
    try {
      setInfo(await getProviders());
      setInfoError('');
    } catch (err) {
      if (err.name === 'AuthError') requireToken();
      else setInfoError(`Cannot reach the API server: ${err.message}`);
    }
  }, [requireToken]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Fetch the model list whenever the provider changes (or Refresh is clicked).
  useEffect(() => {
    if (!provider) return undefined;
    const controller = new AbortController();
    setModelList({ loading: true, models: [], error: '' });
    getModels(provider, controller.signal)
      .then((data) => setModelList({ loading: false, models: data.models, error: '' }))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.name === 'AuthError') requireToken();
        setModelList({ loading: false, models: [], error: err.message });
      });
    return () => controller.abort();
  }, [provider, modelsVersion, requireToken]);

  const update = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const refresh = () => {
    loadProviders();
    setModelsVersion((v) => v + 1);
  };

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    stop();
    setMessages([]);
  };

  async function send(text) {
    const content = text.trim();
    if (!content || streaming || !provider) return;

    const userMessage = { id: newId(), role: 'user', content };
    const assistantId = newId();

    // Failed exchanges (the question and its error) stay on screen but are not sent to the model,
    // so retrying after fixing the model or key doesn't send the question twice.
    const all = [...messages, userMessage];
    const history = all
      .filter((m, i) => !m.error && !(m.role === 'user' && all[i + 1]?.error))
      .map(({ role, content: c, raw }) => ({ role, content: c, ...(raw && { raw }) }));

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', pending: true, provider, model: shownModel },
    ]);

    const patch = (change) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)),
      );

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    try {
      await streamChat(
        {
          provider,
          model: model || undefined,
          system: settings.system.trim() || undefined,
          temperature: settings.temperature === '' ? undefined : Number(settings.temperature),
          messages: history,
        },
        {
          signal: controller.signal,
          onEvent: ({ event, data }) => {
            if (event === 'start') patch({ model: data.model });
            else if (event === 'delta') patch((m) => ({ content: m.content + data.text }));
            else if (event === 'done') patch({ raw: data.raw, stopReason: data.stopReason, usage: data.usage });
            else if (event === 'error') patch({ error: data.message });
          },
        },
      );
    } catch (err) {
      if (err.name === 'AbortError') patch({ stopped: true });
      else patch({ error: err.message });
      if (err.name === 'AuthError') requireToken();
    } finally {
      patch({ pending: false });
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const providerReady =
    providerInfo && (providerInfo.requiresKey ? providerInfo.configured : providerInfo.reachable !== false);

  if (auth.needed) {
    return (
      <TokenGate
        rejected={auth.rejected}
        onSubmit={(token) => {
          setToken(token);
          setAuth({ needed: false, rejected: false });
          refresh();
        }}
      />
    );
  }

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        info={info}
        infoError={infoError}
        provider={provider}
        onProviderChange={(id) => update({ provider: id })}
        model={model}
        defaultModel={providerInfo?.defaultModel || modelList.models[0] || ''}
        onModelChange={(value) => update({ models: { ...settings.models, [provider]: value } })}
        modelList={modelList}
        onRefresh={refresh}
        system={settings.system}
        defaultSystem={info?.systemPrompt || ''}
        onSystemChange={(value) => update({ system: value })}
        temperature={settings.temperature}
        onTemperatureChange={(value) => update({ temperature: value })}
      />
      {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="chat">
        <header className="chat-header">
          <button type="button" className="icon-button menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open settings">
            ☰
          </button>
          <div className="chat-title">
            <h1>Basic Agent</h1>
            <span className="chat-subtitle">
              {providerInfo ? `${providerInfo.label} · ${shownModel || 'no model'}` : 'Connecting…'}
            </span>
          </div>
          <button type="button" className="ghost-button" onClick={newChat} disabled={!messages.length}>
            New chat
          </button>
        </header>

        <MessageList
          messages={messages}
          empty={
            <div className="empty">
              <h2>What can I help with?</h2>
              <p>
                {providerReady
                  ? `Messages go to ${providerInfo.label} · ${shownModel || 'default model'}`
                  : 'Pick a provider in the settings panel to get started.'}
              </p>
              <div className="examples">
                {EXAMPLES.map((example) => (
                  <button key={example} type="button" onClick={() => send(example)} disabled={!providerReady}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          }
        />

        <Composer
          onSend={send}
          onStop={stop}
          streaming={streaming}
          disabled={!provider}
          placeholder={providerInfo ? `Message ${providerInfo.label}…` : 'Message…'}
        />
      </main>
    </div>
  );
}
