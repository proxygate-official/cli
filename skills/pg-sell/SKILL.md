---
name: pg-sell
description: Use when selling API capacity on Proxygate — creating listings, managing listings (update/pause/delete), rotating keys, uploading docs, starting tunnels, managing headers, viewing earnings, or exposing local services. Make sure to use this skill whenever someone mentions "list API", "sell capacity", "create listing", "start tunnel", "expose service", "earnings", "go live", "monetize API", "rotate key", "pause listing", or wants to make their API available on Proxygate.
metadata: {"openclaw":{"requires":{"bins":["proxygate"]},"homepage":"https://proxygate.ai"}}
---

# Proxygate — Sell API Capacity

Seller workflow: create listings, manage them, expose services via tunnel, track earnings.

## Prerequisites

Selling requires authentication. Any auth mode works for creating/managing listings, but **a wallet keypair is recommended** for sellers to receive settlement payouts directly.

- **API key or delegation token**: Can create/manage listings and start tunnels. Earnings accumulate in your Proxygate balance.
- **Wallet keypair**: Full access — earnings settle directly to your Solana wallet.

## Process

### 1. Scaffold a project (optional)

If building a new service from scratch:

```bash
proxygate create                                    # interactive
proxygate create my-agent --template http-api --port 3000
proxygate create my-agent --template llm-agent --port 8080
```

Templates: `http-api` (Hono REST API), `llm-agent` (Hono + LLM provider + streaming).

### 2. Test locally

Validate endpoints before going live:

```bash
proxygate test                                      # auto-detect from tunnel config
proxygate test --endpoint "POST /v1/analyze" --payload '{"code":"x=1"}'
proxygate test -c proxygate.tunnel.yaml
```

### 3. Create a listing

```bash
proxygate listings create    # interactive — walks through service, pricing, description, docs
```

Interactive mode asks for: service name, API key, pricing model, description, documentation, shield settings.

Non-interactive:
```bash
proxygate listings create --non-interactive \
  --service-name "My API" \
  --base-url "https://api.example.com" \
  --auth-pattern bearer \
  --credential "your-api-key" \
  --price 5000 \
  --total-rpm 100 \
  --categories ai \
  --description "Fast Llama 3.3 access"
```

### Free listings (Phase 51.6)

Any seller may submit a free listing. The row enters "Pending approval" until an admin sets `free_listing_approved=true`.

```bash
# Wholly free listing (admin approval required before it goes live):
proxygate listings create --non-interactive \
  --service-name "Open-Meteo" --base-url "https://api.open-meteo.com" \
  --auth-pattern none --categories "weather" --free

# --free is shorthand for --price 0:
proxygate listings create --non-interactive ... --price 0

# matrix row 3 — paid listing with free endpoint overrides (paid + free):
proxygate listings create --non-interactive ... --price 1000 \
  --free-endpoint "/v1/sample" --free-endpoint "/v1/ping:50"

# matrix row 4 — free listing with paid endpoint overrides (free + paid):
proxygate listings create --non-interactive ... --free \
  --endpoint-price "/v1/premium=5000" --endpoint-price "/v1/bulk=10000"
```

`--free` and `--price` are mutually exclusive — passing both prints a warning and uses `price=0`. Per-endpoint cap shorthand: `--free-endpoint "/path:N"` sets a per-wallet daily cap of `N` on that endpoint.

### Priced variants (same upstream, different price)

Charge differently for the same upstream path depending on what it returns (e.g. `GET /stories` with vs without sentiment). A variant is its own buyer-facing endpoint that forwards to the base upstream path but has its own price, optional name, and one or more **forced params** (`query_overrides`/`body_overrides`) that distinguish it. Buyers cannot change a forced param, so it both differentiates the product and guarantees what the buyer pays for.

Forced params are **per-endpoint and do not cascade**: each endpoint only ever applies its own forced params. The base endpoint's overrides never bleed into a variant, and a variant's never bleed into the base. You only add a forced param to lock in what a variant should send, never to "escape" the base.

Setting up variants (the buyer path + upstream-path mapping + forced params) is web-only — use the endpoints editor in the seller dashboard. The variant then appears as a normal, separately priced endpoint in the catalog, CLI, SDK, and MCP, carrying its `label`.

Per-listing logo upload is web-only — drag/drop in the seller dashboard wizard. There is no CLI flag for it.

### 4. Manage listings

```bash
# View listings
proxygate listings list                     # list your listings
proxygate listings list --table             # table format with status, RPM, price

# Update a listing
proxygate listings update <id> --price 3000 --description "Updated pricing"

# Pause/unpause (stop accepting requests temporarily)
proxygate listings pause <id>
proxygate listings unpause <id>

# Delete permanently
proxygate listings delete <id>

# Rotate API key or OAuth2 credentials (no downtime)
proxygate listings rotate-key <id> --key <new-api-key>
proxygate listings rotate-key <id> --oauth2 <new-token>

# Upload API documentation
proxygate listings upload-docs <id> ./openapi.yaml    # OpenAPI or markdown

# View docs for your listing
proxygate listings docs <id>

# Manage upstream headers
proxygate listings headers <id>                        # list current headers
proxygate listings headers <id> set X-Custom "value"   # add/update header
proxygate listings headers <id> unset X-Custom         # remove header
```

### 5. Configure tunnel

Create `proxygate.tunnel.yaml`:

```yaml
services:
  - name: my-api
    port: 8080
    description: My AI service
    category_slugs: [ai-agents]       # 1-3 slugs (recommended for marketplace findability)
    price_per_request: 1000           # lamports (0.001 USDC)
    total_rpm: 500                    # capacity, default 100
    reserved_rpm: 50                  # reserved for owner
    listing_type: service             # proxy|skill|product|dataset|service|connector
    shield_enabled: true              # opt-in PII / prompt-injection scanning
    upstream_headers:                 # static headers injected upstream
      X-Internal-Source: tunnel
    docs: ./openapi.yaml              # auto-uploaded on connect
    endpoints:
      - method: POST
        path: /v1/analyze
        description: Analyze code
    paths:
      - /v1/*
```

Per-token pricing:
```yaml
services:
  - name: llm-service
    port: 3000
    pricing_unit: per_token
    price_per_input_token: 100
    price_per_output_token: 300
```

**Field reference (parity with Studio listings):**

| Field | Default | Notes |
|---|---|---|
| `category_slugs` | none | 1-3 slugs; without this listing won't appear under category filters |
| `total_rpm` / `reserved_rpm` | 100 / 0 | Capacity fence (sliding window) |
| `listing_type` | `proxy` | `proxy` for tunnels usually fine; pick `service` / `dataset` for non-API offerings |
| `type_metadata` | `null` | Type-specific (e.g. `{ file_url: ... }` for dataset) |
| `shield_enabled` | `false` | Seller pays for Shield request scanning. BasicScanner free; ModelArmor requires gateway env flag |
| `upstream_headers` | `{}` | Static headers added to every upstream request |

### 6. Start tunnel

```bash
# Development (request logging + config file watching + auto-reload)
proxygate dev
proxygate dev -c my-services.yaml

# Production (stable connection, auto-reconnect, graceful drain on Ctrl+C)
proxygate tunnel
proxygate tunnel -c proxygate.tunnel.yaml
```

Dev mode shows live request/response logs with status, latency, and size. Production mode is for long-running stable connections with automatic reconnection.

### 7. Check earnings

```bash
proxygate settlements                              # earnings summary
proxygate settlements -r seller                    # seller-specific view
proxygate settlements -s weather-api --from 2026-03-01  # filtered
proxygate balance                                  # current balance
proxygate listings list --table                    # listing status overview
```

## SDK — Programmatic Serving

```typescript
import { Proxygate, ProxygateClient } from '@proxygate/sdk';

// One-liner: expose services immediately
const tunnel = await Proxygate.serve({
  keypair: '~/.proxygate/keypair.json',
  services: [
    { name: 'code-review', port: 3000, docs: './openapi.yaml' },
  ],
  onConnected(listings) { console.log('Live!', listings); },
});

// Or via client for more control
const client = await ProxygateClient.create({
  keypairPath: '~/.proxygate/keypair.json',
});

// Manage listings programmatically
const { listings } = await client.listings.list();
await client.listings.update('listing-id', { price_per_request: 3000 });
await client.listings.pause('listing-id');
await client.listings.unpause('listing-id');
await client.listings.rotateKey('listing-id', { api_key: 'your-new-api-key' });
await client.listings.uploadDocs('listing-id', {
  doc_type: 'openapi',
  content: fs.readFileSync('./openapi.yaml', 'utf-8'),
});

// Start tunnel
const tunnel = await client.serve([
  { name: 'my-api', port: 3000 },
]);

// Graceful shutdown (waits for in-flight requests)
await tunnel.drain();
tunnel.disconnect();
```

## Success criteria

- [ ] Service running locally and responding to requests
- [ ] Listing created (visible in `proxygate listings list`)
- [ ] Tunnel connected (dev or production mode)
- [ ] Incoming requests visible in dev mode logs

## Related skills

| Need | Skill |
|------|-------|
| First-time setup | `pg-setup` |
| Buy API access | `pg-buy` |
| Sell API capacity | **This skill** |
| Check status | `pg-status` |
| Update CLI/SDK | `pg-update` |
