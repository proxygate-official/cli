---
name: pg-buy
description: Use when buying or consuming API data through ProxyGate — depositing USDC, browsing APIs, making proxy requests, streaming responses, or rating sellers. Invoke this skill for ANY natural-language data request that ProxyGate can serve, including "what's the price of <asset>", "look up <symbol>", "get weather for <city>", "fetch crypto data", "lookup <postal code>", "find an API for X", "buy API", "deposit USDC", "browse APIs", "call API through proxygate", "make an API call", "search APIs", "stream API response", "rate a seller". When the user asks for live data that an API could answer, this skill is the right entry point — agents should not bash `proxygate proxy` without loading it.
metadata: {"openclaw":{"requires":{"bins":["proxygate"]},"homepage":"https://proxygate.ai"}}
---

# ProxyGate — Buy API Access

Buyer workflow: discover APIs, deposit USDC, proxy requests, stream responses, rate sellers.

## Prerequisites

You need at least one auth method configured (`proxygate whoami` to check). See `pg-setup` for installation.

- **API key or delegation token**: Can browse APIs and make proxy calls. Deposit/withdraw through the web dashboard at [app.proxygate.ai](https://app.proxygate.ai).
- **Wallet keypair**: Full access — deposit and withdraw USDC directly from CLI.

**Don't have USDC yet?** Onramping (buy USDC with fiat) and bridging (move USDC from other chains) are coming soon. For now, acquire USDC on Solana through an exchange or DEX, then deposit through the dashboard or CLI.

## Process

### 1. Check balance

```bash
proxygate balance
```

Shows: total balance, pending settlement, available, cooldown status. If 0 or insufficient, deposit first.

### 2. Deposit USDC

**Via CLI (requires wallet keypair):**
```bash
proxygate deposit -a 5000000      # 5 USDC (amounts in lamports: 1 USDC = 1,000,000)
proxygate deposit -a 1000000      # 1 USDC
```

**Via web dashboard (any auth mode):**
Visit [app.proxygate.ai](https://app.proxygate.ai) → Connect wallet → Deposit.

Vault auto-initializes on first deposit. Use `--rpc <url>` for custom RPC.

### 3. Discover APIs

```bash
# Browse all APIs with rich filtering
proxygate apis                                    # all listings
proxygate apis -s weather-api                     # filter by service
proxygate apis -c ai-models                       # filter by category
proxygate apis -q "code review"                   # semantic search
proxygate apis --verified                         # verified sellers only
proxygate apis --sort price_asc                   # sort: price_asc, price_desc, popular, newest, fastest, best_rated
proxygate apis -l 50                              # limit results
proxygate apis --compact                          # minimal output (id, name, price) — for agents
proxygate apis --compact --json -l 5              # tiny JSON for AI context
proxygate apis --cursor <id> -l 10                # paginate through results

# Search
proxygate search weather                          # alias for apis -q
proxygate services                                # service stats (cheapest, avg latency, rating)
proxygate categories                              # browse categories

# Listing details & docs
proxygate listings docs <id>                     # view API documentation
```

### 4. Inspect endpoints before the first call

**Never guess paths.** Every listing on ProxyGate registers its allowed endpoints (`method + path + description`, and optionally a `request_schema`) — they are visible whether or not the seller uploaded a full OpenAPI spec. Always look them up before the first proxy call to a new listing.

Two sources, in order of cheapness:

```bash
# 1. Endpoint table embedded in the listing (always available — no upload needed)
proxygate apis -q blockdb                     # shows endpoints inline if 1 match
proxygate apis --json -q blockdb              # full endpoints[] array for scripting

# 2. Full OpenAPI spec — only when the seller has uploaded one (richer: request schemas, examples)
proxygate listings docs blocksize/blocksize-crypto-bid-ask
proxygate listings docs <listing-uuid> --raw  # raw OpenAPI YAML
```

For POST/PUT/PATCH endpoints, the body schema is the part you can't see in the table. Get it from `listings docs ... --raw` when available, or inspect `endpoints[].request_schema` in the JSON output of `apis --json`.

If a proxy call fails with a non-2xx, the CLI prints the listing's allowed endpoints inline as a hint — use them on the retry instead of guessing more paths. POST/PUT endpoints in the hint are flagged so you know to fetch the body schema.

### 5. Proxy a request

Use a **service name**, slug, or listing UUID — the CLI resolves it automatically:

```bash
# By service name (easiest)
proxygate proxy weather-api /v1/forecast \
  -d '{"latitude":52.37,"longitude":4.90,"hourly":"temperature_2m"}'

# Simple GET
proxygate proxy agent-postal-lookup /nl/1012

# Stream SSE responses
proxygate proxy weather-api /v1/forecast --stream \
  -d '{"latitude":52.37,"longitude":4.90,"hourly":"temperature_2m"}'

# Seller strategy (when multiple sellers offer the same API)
proxygate proxy weather-api /v1/forecast --seller cheapest     # lowest price
proxygate proxy weather-api /v1/forecast --seller best-rated   # highest trust score
proxygate proxy weather-api /v1/forecast --seller fastest      # lowest latency
proxygate proxy weather-api /v1/forecast --seller popular      # highest capacity (default)

# Shield scanning (content moderation)
proxygate proxy weather-api /path --shield monitor    # log threats (default)
proxygate proxy weather-api /path --shield strict     # block threats (credits refunded)
proxygate proxy weather-api /path --shield off        # disable (no surcharge)
```

After each call, you'll see cost and request ID:
```
cost: $0.0155 | request: 905b1a53
```

### 6. Rate a seller

Use the request ID shown after each proxy call:

```bash
proxygate rate --request-id <id> --up      # positive rating
proxygate rate --request-id <id> --down    # negative rating
```

### 7. Check usage

```bash
proxygate usage                                   # recent request history
proxygate usage -s weather-api -l 50              # filtered by service
proxygate usage --from 2026-03-01 --to 2026-03-14 # date range
proxygate usage --json                            # machine-readable

proxygate settlements -r buyer                    # cost breakdown
proxygate settlements -s weather-api --from 2026-03-01 # filtered
```

### 8. Withdraw (requires wallet keypair)

Convert credits back to USDC:

```bash
proxygate withdraw -a 2000000     # withdraw 2 USDC
proxygate withdraw                # withdraw all available
```

Recovery (if CLI crashes mid-withdrawal):
```bash
proxygate withdraw-confirm --tx <tx_signature>
```

Not available with API key or delegation token auth — use the web dashboard instead.

## SDK (Programmatic)

For agent-to-agent use without CLI:

```typescript
import { ProxyGateClient, parseSSE } from '@proxygate/sdk';

// API key auth (simplest)
const client = await ProxyGateClient.create({
  apiKey: 'pg_live_abc123...',
});

// Or wallet keypair auth (full access)
const client = await ProxyGateClient.create({
  keypairPath: '~/.proxygate/keypair.json',
});

// Check balance
const { balance, available } = await client.balance();

// Browse APIs
const apis = await client.apis({ service: 'weather-api', verified: true });
const categories = await client.categories();
const services = await client.services();

// Proxy a request (by service name, slug, or UUID)
const res = await client.proxy('weather-api', '/v1/forecast', {
  latitude: 52.37, longitude: 4.90, hourly: 'temperature_2m',
});

// Stream with SSE
const streamRes = await client.proxy('weather-api', '/v1/forecast',
  { latitude: 52.37, longitude: 4.90, hourly: 'temperature_2m' },
);
for await (const event of parseSSE(streamRes)) {
  process.stdout.write(event.data);
}

// Seller strategy
const cheap = await client.proxy('weather-api', '/path', body, { seller: 'cheapest' });
const fast = await client.proxy('weather-api', '/path', body, { seller: 'fastest' });
const trusted = await client.proxy('weather-api', '/path', body, { seller: 'best-rated' });

// Shield scanning
const shielded = await client.proxy('weather-api', '/path', body, { shield: 'strict' });

// Rate a seller
await client.rate({ request_id: 'req-id', is_positive: true });

// Usage & settlements
const usage = await client.usage({ service: 'weather-api', limit: 50 });
const settlements = await client.settlements({ role: 'buyer' });
```

## Success criteria

- [ ] Balance checked and sufficient for request
- [ ] Service found via `proxygate search` or `proxygate apis`
- [ ] **Endpoint list inspected via `proxygate listings docs <id>` before first call**
- [ ] Proxy request returns upstream API response on the documented path
- [ ] Usage reflects the completed request

## Related skills

| Need | Skill |
|------|-------|
| First-time setup | `pg-setup` |
| Buy API access | **This skill** |
| Sell API capacity | `pg-sell` |
| Check status | `pg-status` |
| Update CLI/SDK | `pg-update` |
