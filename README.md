# Basic Agent

A simple chat agent: type a message in a React UI and get a streamed answer from **Ollama** (local models), **Claude** (Anthropic API), **OpenAI**, **Grok** (xAI API) or **Groq** (fast open models such as gpt-oss and Llama). You can switch provider and model at any point in a conversation.

- **Frontend:** React 19 + Vite
- **Backend:** Node.js + Express 5, official `@anthropic-ai/sdk` and `openai` SDKs (the latter also for Grok and Groq, via their OpenAI-compatible APIs), Ollama over its REST API
- Streaming replies over Server-Sent Events, with a Stop button that also cancels the upstream request
- Per-provider model list loaded live from each API, or type any model id
- Editable system prompt and optional temperature
- API keys stay on the server and are never sent to the browser

---

## Quick start

**Requirements:** Node.js 20.19+ or 22.12+. For local models, install [Ollama](https://ollama.com) and pull a model.

```bash
# 1. Install everything (root + server + client workspaces)
npm install

# 2. Configure providers
cp server/.env.example server/.env
#    then edit server/.env and add ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY and/or GROQ_API_KEY

# 3. (optional) local models
ollama pull llama3.2

# 4. Run backend (:3001) and frontend (:5173) together
npm run dev
```

Open **http://localhost:5173**.

You only need to configure the providers you use. A provider without a key still appears in the dropdown, marked "no API key", along with setup instructions.

### Production

```bash
npm run build   # builds client/dist
npm start       # Express serves the API and the built UI on http://localhost:3001
```

---

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` / `HOST` | `3001` / `127.0.0.1` | Use `0.0.0.0` only when hosting, together with `ACCESS_TOKENS` |
| `ACCESS_TOKENS` | – | Comma-separated tokens (16+ chars). When set, every `/api` route except `/api/health` requires `Authorization: Bearer <token>`. **Required** on a public `HOST`: without it the API stays disabled and every page explains what to set. |
| `ALLOW_NO_AUTH` | `false` | `true` skips that check, only for when your own auth (proxy, VPN) protects the server |
| `CLIENT_SIGNING_KEY` | – | 32+ random chars. Turns on **Client ID & Secret** credentials made in the UI (Connect → Credentials). Changing it revokes all of them. |
| `REVOKED_CLIENT_IDS` | – | Comma-separated Client IDs to cut off individually |
| `DEFAULT_PROVIDER` | first configured | `ollama`, `anthropic`, `openai`, `grok` or `groq` |
| `AGENT_SYSTEM_PROMPT` | helpful assistant | Used when the UI system prompt is blank |
| `AGENT_MAX_HISTORY` | `40` | Messages sent to the model per request |
| `OLLAMA_HOST` | `http://localhost:11434` | |
| `OLLAMA_MODEL` | first installed model | |
| `OLLAMA_THINK` | model default | `true`/`false`/`low`/`medium`/`high` for thinking models |
| `OLLAMA_API_KEY` | – | Only for a remote Ollama that needs a bearer token |
| `ANTHROPIC_API_KEY` | – | |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | e.g. `claude-opus-5-5`, `claude-haiku-5-5` |
| `ANTHROPIC_MAX_TOKENS` | `16000` | Hard cap on thinking + answer |
| `ANTHROPIC_EFFORT` | model default | `low` … `max` |
| `OPENAI_API_KEY` | – | |
| `OPENAI_MODEL` | `gpt-6.2-sol` | e.g. `gpt-6.2-astra` |
| `OPENAI_API_MODE` | `responses` | `chat` = Chat Completions (see below) |
| `OPENAI_BASE_URL` | – | Any OpenAI-compatible server |
| `XAI_API_KEY` | – | From [console.x.ai](https://console.x.ai) |
| `XAI_MODEL` | `grok-4.7` | Any model id from xAI's models page |
| `XAI_MAX_TOKENS` | model default | Output token cap |
| `XAI_REASONING_EFFORT` | model default | e.g. `low`/`medium`/`high`; supported values depend on the model |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | |
| `GROQ_API_KEY` | – | From [console.groq.com](https://console.groq.com) (starts with `gsk_`) |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | e.g. `openai/gpt-oss-20b`, `llama-3.3-70b-versatile` |
| `GROQ_MAX_TOKENS` | model default | Output token cap |
| `GROQ_REASONING_EFFORT` | model default | gpt-oss models only: `low`/`medium`/`high` |
| `GROQ_BASE_URL` | `https://api.groq.com/openai/v1` | |

**Grok vs Groq:** two different companies. **Grok** is xAI's model family (keys start with `xai-`). **Groq** (groq.com) hosts open models like gpt-oss and Llama (keys start with `gsk_`). Use the provider that matches your key.

**Grok** uses xAI's Responses API (xAI's recommended endpoint; Chat Completions is legacy there) with `store: false`, so xAI does not keep your conversations server-side.

**OpenAI-compatible servers** (OpenRouter, Groq, LM Studio, vLLM…): set `OPENAI_BASE_URL`, `OPENAI_API_KEY` and `OPENAI_API_MODE=chat`.

**Temperature:** leave it blank unless you need it. Some current models reject custom values, including Claude Opus 5.5 and OpenAI's reasoning models. The backend only sends temperature when you set one.

---

## Project structure

```
basic-agent/
├── package.json              # npm workspaces + dev/build/start scripts
├── server/
│   ├── .env.example
│   └── src/
│       ├── index.js          # Express app, serves client/dist in production
│       ├── config.js         # reads server/.env
│       ├── agent.js          # the agent: validates input, picks model, runs provider
│       ├── errors.js         # turns SDK/network errors into readable messages
│       ├── auth.js           # ACCESS_TOKENS check; API stays off on a public HOST without tokens
│       ├── credentials.js    # Client ID/Secret, API keys and OAuth tokens (no storage needed)
│       ├── routes/
│       │   ├── chat.js       # POST /api/chat (SSE or JSON)
│       │   ├── agents.js     # GET /api/agents, POST /api/agents/:id/chat (for Signet etc.)
│       │   ├── clients.js    # POST /api/oauth/token, POST /api/clients
│       │   └── providers.js  # GET /api/providers, /api/providers/:id/models
│       └── providers/
│           ├── index.js      # provider registry
│           ├── ollama.js
│           ├── anthropic.js
│           ├── openai.js
│           ├── grok.js       # xAI, via the openai SDK
│           └── groq.js       # GroqCloud, via the openai SDK
└── client/
    ├── vite.config.js        # proxies /api -> :3001 in dev
    └── src/
        ├── App.jsx           # state, sending, streaming
        ├── api.js            # fetch + SSE parser
        └── components/       # Sidebar, MessageList, Composer, TokenGate, ConnectPanel
```

**Request flow:** `React UI → POST /api/chat → agent.js → providers/<name>.js → model API`, with tokens streamed back the same way.

---

## Deploy to Railway

The app is one Node server that serves both the UI and the API, so it deploys to [Railway](https://railway.com) as-is. Railway detects the npm workspaces and runs the root `build` and `start` scripts, so no Railway config file is needed.

1. **Put the code on GitHub** in a **private** repository. `server/.env` is git-ignored, so your keys stay on your machine. Check that `git status` never lists it.
2. **Create the service:** on Railway, choose **New Project → Deploy from GitHub repo** and pick the repository.
3. **Set variables:** open the service, go to **Variables → Raw Editor**, and paste:
   ```
   HOST=0.0.0.0
   ACCESS_TOKENS=<token-for-you>,<token-for-other-project>
   GROQ_API_KEY=<your Groq key>
   DEFAULT_PROVIDER=groq
   ```
   Generate each token with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`. Add any other provider keys you use. Railway sets `PORT` itself, so don't set it.
4. **Get a URL:** go to **Settings → Networking → Generate Domain**. Optionally, set **Settings → Deploy → Healthcheck Path** to `/api/health`.
5. Open the URL and paste one of your tokens when asked. The browser remembers it.

Notes:
- Ollama runs on your own computer, so it shows as "Not running" when hosted.
- On Railway's free plan, services sleep when idle, so the first request after a pause is slow. The Hobby plan keeps the service always on.
- Streaming works on Railway. The server sends a keep-alive ping every 15 seconds, so long answers stay connected.
- **Changing tokens:** edit `ACCESS_TOKENS` in Railway and redeploy. A removed token stops working immediately.

---

## Use the agent from another project

Call the hosted API **from your other project's backend** with one of the `ACCESS_TOKENS`. Keep the token in that project's environment variables (e.g. `AGENT_URL`, `AGENT_TOKEN`). Don't put it in browser code, where anyone can read it.

```js
// Simple: one JSON reply
async function askAgent(messages) {
  const res = await fetch(`${process.env.AGENT_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AGENT_TOKEN}` },
    // No provider: the server's DEFAULT_PROVIDER answers, so you can switch LLMs
    // in Railway without touching this project. Add `provider`/`model` to pick one.
    body: JSON.stringify({ stream: false, messages }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data.reply;
}

await askAgent([{ role: 'user', content: 'Summarize this ticket: ...' }]);
```

To show the answer while it is being written, leave out `stream: false` and read the Server-Sent Events described below. `client/src/api.js` has a small parser you can copy. Any language works: it's plain HTTPS with a bearer token.

```bash
curl -s https://<your-app>.up.railway.app/api/chat \
  -H "Authorization: Bearer $AGENT_TOKEN" -H 'content-type: application/json' \
  -d '{"stream":false,"messages":[{"role":"user","content":"Hi"}]}'
```

Only set `CORS_ORIGIN` if a browser on another site must call the API directly. In that case the token is visible to that site's users, so prefer calling from a backend.

---

## Connect to Signet (or another agent platform)

Agent platforms discover agents over REST, then call them. This server lists **one agent per provider that is ready** (API key set, or Ollama running). With only `GROQ_API_KEY` set, that is a single agent, `basic-agent-groq`.

**Everything below is also in the app:** click **Connect** (top right). It shows the Base URL, the agents, and the mapping, with copy buttons, and generates credentials.

**1. Turn on credentials (once).** In Connect, the Credentials section shows a freshly generated `CLIENT_SIGNING_KEY`. Add it to Railway → Variables and deploy.

**2. Generate a Client ID & Secret.** In Connect, enter a platform name (e.g. `Signet`) and click **Generate Client ID & Secret**. You get:

| Value | Use it for |
|---|---|
| Client ID + Client Secret | Signet's **Client ID and Client Secret** option |
| Token URL (`…/api/oauth/token`) | if Signet asks for a token endpoint (OAuth 2.0 `client_credentials`) |
| API key (`<client id>.<secret>`) | Signet's **REST API** option, as "API key / secret" |

Copy the secret right away: it is not shown again. Nothing is stored on the server (the secret is derived from `CLIENT_SIGNING_KEY`), so credentials survive redeploys. To cut one platform off, add its Client ID to `REVOKED_CLIENT_IDS`; to cut all of them off, change `CLIENT_SIGNING_KEY`.

**3. In Signet**, Base URL is `https://<your-app>.up.railway.app/api`, plus the credentials from step 2.

**API settings and endpoint mapping** (only change what Signet asks for):

| Setting | Value |
|---|---|
| Auth | `Authorization: Bearer <API key or access token>` (default). Also accepted: `X-API-Key: <key>`, Basic `client_id:client_secret`, or `X-Client-Id` + `X-Client-Secret`. |
| Token endpoint | `POST /oauth/token`, `grant_type=client_credentials`, client ID/secret via Basic auth or body; returns `access_token` (1 hour) |
| List agents | `GET /agents` → array at `agents` |
| Get one agent | `GET /agents/{id}` |
| Agent fields | id `id`, name `name`, description `description`, status `status` (`active`), model `model`, system prompt `instructions` |
| Invoke / chat | `POST /agents/{id}/chat` with JSON body `{"input": "<user message>"}` |
| Response text | `reply` (also `model`, `usage.inputTokens`, `usage.outputTokens`) |

If Signet's Base URL must be the bare domain, use `https://<your-app>.up.railway.app` and prefix each path with `/api` (e.g. `/api/agents`).

**4.** Click **Test connection & find agents**, select **Basic Agent (Groq)**, and continue to Signet's safety questions.

Without `CLIENT_SIGNING_KEY` you can still connect with the REST API option: add a dedicated token to `ACCESS_TOKENS` and use it as the API key.

---

## API

When `ACCESS_TOKENS` is set, send `Authorization: Bearer <token>` (or `X-API-Key: <token>`) with every request. Credentials made in the UI work too (see the Auth row above). Missing or wrong credentials get a `401` with `{ "error": "..." }`. `GET /api/health` and `POST /api/oauth/token` are reachable without a token.

### `GET /api`
Service info, the agent endpoints, and `clientCredentials` (`enabled`, `tokenPath`, `canCreate`). Handy as a connection test.

### `POST /api/oauth/token`
OAuth 2.0 client credentials grant. Send `grant_type=client_credentials` with the Client ID and Secret as HTTP Basic auth, or as `client_id` / `client_secret` in a form-encoded or JSON body. Returns `{ "access_token", "token_type": "Bearer", "expires_in": 3600 }`.

### `POST /api/clients`
`{ "name": "Signet" }` → `201 { clientId, clientSecret, apiKey, tokenPath }`. Requires one of the `ACCESS_TOKENS` (a client can't create clients) and `CLIENT_SIGNING_KEY`.

### `GET /api/agents` · `GET /api/agents/:id`
`{ "agents": [{ "id": "basic-agent-groq", "name": "Basic Agent (Groq)", "description": "...", "status": "active", "type": "chat", "provider": "groq", "model": "openai/gpt-oss-120b", "instructions": "<system prompt>", "capabilities": ["chat","streaming"], "endpoint": "/api/agents/basic-agent-groq/chat" }] }`. Only providers that can answer right now are listed.

### `POST /api/agents/:id/chat`
Same as `POST /api/chat` below, with the provider fixed by the agent and **JSON by default** (send `"stream": true` for SSE). Accepts `{"input": "text"}` (or `message` / `prompt`) as well as `messages`.

### `GET /api/providers`
Lists providers and whether each one is ready (`configured`; for Ollama also `reachable`).

### `GET /api/providers/:id/models`
`{ "models": ["..."], "defaultModel": "..." }`

### `POST /api/chat`

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-5-5",
  "system": "optional system prompt",
  "temperature": 0.7,
  "messages": [{ "role": "user", "content": "Hello!" }],
  "stream": true
}
```

`provider`, `model`, `system` and `temperature` are optional. Without `provider`, the server uses `DEFAULT_PROVIDER` (or the first configured provider). The last message must come from the user.

**Streaming (default):** `text/event-stream` with these events:

```
event: start   data: {"provider":"anthropic","model":"claude-sonnet-5-5"}
event: delta   data: {"text":"Hel"}          (repeated)
event: done    data: {"stopReason":"end_turn","usage":{...},"raw":{...}}
event: error   data: {"status":401,"message":"..."}
```

**Non-streaming:** send `"stream": false` to get one JSON response:

```bash
curl -s localhost:3001/api/chat -H 'content-type: application/json' \
  -d '{"provider":"ollama","stream":false,"messages":[{"role":"user","content":"Hi"}]}'
# {"provider":"ollama","model":"llama3.2:latest","reply":"Hello! ...","stopReason":"stop","usage":{...}}
```

Input errors such as an unknown provider, a missing key or bad messages return a normal HTTP 400 with `{ "error": "..." }`. Errors from the model API after the stream has started arrive as an `error` event.

**About `raw`:** newer Claude models put thinking blocks before the answer, and those blocks should be sent back unchanged on the next turn. The server returns them in `raw`, and the UI stores them on the assistant message and sends them back. The server replays them only when the conversation stays on the same Claude model. Otherwise it sends plain text. If you call the API yourself, sending `{ role, content }` alone is fine.

---

## Extending

- **Add a provider:** create `server/src/providers/<name>.js` exporting `{ id, label, requiresKey, defaultModel, isConfigured(), listModels(), stream() }`, where `stream()` yields `{type:'text', text}` chunks and then one `{type:'done'}`. Register it in `providers/index.js` and it appears in the UI automatically.
- **Make it more agentic:** `runAgent()` in `server/src/agent.js` is the single place where a conversation turns into a model call. Add tool calling, retrieval or memory there without touching the routes or the UI.
- **Persist chats:** not included. Chats live in browser memory; only settings (and the access token, when used) are saved to `localStorage`.
- **Auth:** shared access tokens (`ACCESS_TOKENS`) are built in, see `server/src/auth.js`. For per-user accounts, put a real auth provider in front.
