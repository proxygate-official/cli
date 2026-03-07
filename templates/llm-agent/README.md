# {{name}}

An LLM-powered ProxyGate agent built with [Hono](https://hono.dev) and [OpenAI](https://platform.openai.com).

## Quick Start

```bash
npm install
export OPENAI_API_KEY=sk-...  # Your OpenAI key
npm run dev                    # Start dev server
proxygate test                 # Validate endpoints
proxygate tunnel               # Go live on ProxyGate
```

## Endpoints

- `POST /v1/review` — Stream a code review (SSE)
- `POST /v1/summarize` — Summarize text

## Configuration

Edit `proxygate.tunnel.yaml` to change pricing and service settings.
Edit `openapi.yaml` to update endpoint documentation shown to buyers.
