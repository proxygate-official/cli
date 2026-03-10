---
name: pg-sell
description: Use when selling API capacity on ProxyGate — creating listings, starting tunnels, managing keys, viewing earnings, or exposing local services. Make sure to use this skill whenever someone mentions "list API", "sell capacity", "create listing", "start tunnel", "expose service", "earnings", "go live", "monetize API", or wants to make their API available on ProxyGate.
---

# ProxyGate — Sell API Capacity

Seller workflow: create listings, expose services via tunnel, manage earnings.

<purpose>
Help the user list their API capacity on ProxyGate, expose services via reverse tunnel, scaffold agent projects, and track earnings.
</purpose>

<required_reading>
Verify CLI is configured first: `proxygate balance`. If this fails, use `/pg-setup` before continuing.
</required_reading>

<process>

<step name="scaffold_project">
If building a new service, scaffold it first:

```bash
proxygate create                                    # interactive
proxygate create my-agent --template http-api --port 3000
proxygate create my-agent --template llm-agent --port 8080
```

Templates: `http-api` (generic HTTP), `llm-agent` (LLM-based agent).
</step>

<step name="test_locally">
Validate endpoints before going live:

```bash
proxygate test                                      # auto-detect from config
proxygate test --endpoint "POST /v1/analyze" --payload '{"code":"x=1"}'
```
</step>

<step name="create_listing">
Create a listing on ProxyGate:

```bash
proxygate listings create    # interactive — walks through service, pricing, etc.
```

This is interactive and asks for: service name, pricing model, description, and endpoint info.

View existing listings:
```bash
proxygate listings list
proxygate listings list --table
proxygate listings list --json
```
</step>

<step name="configure_tunnel">
Create a tunnel config file (`proxygate.tunnel.yaml`):

```yaml
services:
  - name: my-api
    port: 8080
    price_per_request: 1000    # lamports (0.001 USDC)
    description: My AI service
    docs: ./openapi.yaml
    endpoints:
      - method: POST
        path: /v1/analyze
        description: Analyze code
```

For per-token pricing:
```yaml
services:
  - name: llm-service
    port: 3000
    pricing_unit: per_token
    price_per_input_token: 100
    price_per_output_token: 300
```
</step>

<step name="start_tunnel">
Expose services to ProxyGate:

```bash
# Development (request logging + config file watching)
proxygate dev
proxygate dev -c my-services.yaml

# Production (stable connection, auto-reconnect)
proxygate tunnel
proxygate tunnel -c proxygate.tunnel.yaml
```

Dev mode watches the config file for changes and shows request logs. Production mode is for stable, long-running connections.
</step>

<step name="check_earnings">
Monitor performance and earnings:

```bash
proxygate settlements              # earnings summary
proxygate balance                  # current balance
proxygate listings list            # check listing status
```
</step>

</process>

## SDK — One-Liner Serve

For programmatic use without CLI:

```typescript
import { ProxyGate } from '@proxygate/sdk';

const tunnel = await ProxyGate.serve({
  keypair: '~/.proxygate/keypair.json',
  services: [
    { name: 'code-review', port: 3000, docs: './openapi.yaml' },
  ],
  onConnected(listings) { console.log('Live!', listings); },
});

// Graceful shutdown
await tunnel.drain();    // waits for in-flight requests
tunnel.disconnect();
```

<success_criteria>
- [ ] Service running locally and responding to requests
- [ ] Listing created (visible in `proxygate listings list`)
- [ ] Tunnel connected (dev or production mode)
- [ ] Incoming requests visible in dev mode logs
</success_criteria>

## Scope

| Need | Skill |
|------|-------|
| First-time setup | `/pg-setup` |
| Buy API access | `/pg-buy` |
| Sell API capacity | **This skill** (`pg-sell`) |
| Check status | `/pg-status` |
| Update CLI | `/pg-update` |

## Reference

For full CLI command reference, see [references/commands.md](references/commands.md).
