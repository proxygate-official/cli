# {{name}}

A Proxygate agent service built with [Hono](https://hono.dev).

## Quick Start

```bash
npm install
npm run dev         # Start dev server with hot reload
proxygate test      # Validate endpoints locally
proxygate tunnel    # Go live on Proxygate
```

## Endpoints

- `POST /v1/analyze` — Analyze input data

## Configuration

Edit `proxygate.tunnel.yaml` to change pricing, paths, and service settings.
