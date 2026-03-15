---
name: pg-buy
description: Use when buying API access through ProxyGate — depositing USDC, browsing available APIs, making proxy requests, streaming responses, or rating sellers. Make sure to use this skill whenever someone mentions "proxy request", "buy API", "deposit USDC", "browse APIs", "call API through proxygate", "make an API call", "find an API", "search APIs", or wants to consume any API through ProxyGate, even if they don't explicitly say "buy".
---

# ProxyGate — Buy API Access

Buyer workflow: deposit USDC, discover APIs, proxy requests, stream responses, rate sellers.

## Process

### 1. Check balance

```bash
proxygate balance
```

Shows: total balance, pending settlement, available, cooldown status. If 0 or insufficient, deposit first.

### 2. Deposit USDC

```bash
proxygate deposit -a 5000000      # 5 USDC (amounts in lamports: 1 USDC = 1,000,000)
proxygate deposit -a 1000000      # 1 USDC
```

Vault auto-initializes on first deposit. User needs USDC in their Solana wallet. Use `--rpc <url>` for custom RPC.

### 3. Discover APIs

```bash
# Browse all APIs with rich filtering
proxygate apis                                    # all listings
proxygate apis -s openai                          # filter by service
proxygate apis -c ai-models                       # filter by category
proxygate apis -q "code review"                   # semantic search
proxygate apis --verified                         # verified sellers only
proxygate apis --sort price_asc                   # sort: price_asc, price_desc, popular, newest
proxygate apis -l 50                              # limit results

# Aggregated views
proxygate pricing                                 # pricing table (service, type, price, sellers, RPM)
proxygate pricing -s anthropic --json             # machine-readable
proxygate services                                # service stats (cheapest, avg latency, rating)
proxygate categories                              # browse categories

# Listing details & docs
proxygate listings docs <listing-id>              # view API documentation
```

Note the `listing-id` from output — needed for proxy requests.

### 4. Proxy a request

```bash
# POST request (default when -d is given)
proxygate proxy <listing-id> /v1/chat/completions \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'

# GET request
proxygate proxy <listing-id> /v1/models -X GET

# Stream SSE responses
proxygate proxy <listing-id> /v1/chat/completions --stream \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}],"stream":true}'

# With shield scanning (content moderation)
proxygate proxy <listing-id> /path --shield monitor    # log threats
proxygate proxy <listing-id> /path --shield strict     # block threats
proxygate proxy <listing-id> /path --shield off        # disable
```

### 5. Rate a seller

After a proxy request, rate the seller using the request ID from the response receipt:

```bash
proxygate rate --request-id <id> --up      # positive rating
proxygate rate --request-id <id> --down    # negative rating
```

### 6. Check usage

```bash
proxygate usage                                   # recent request history
proxygate usage -s openai -l 50                   # filtered by service
proxygate usage --from 2026-03-01 --to 2026-03-14 # date range
proxygate usage --json                            # machine-readable

proxygate settlements -r buyer                    # cost breakdown
proxygate settlements -s openai --from 2026-03-01 # filtered
```

### 7. Withdraw (optional)

Convert credits back to USDC:

```bash
proxygate withdraw -a 2000000     # withdraw 2 USDC
proxygate withdraw                # withdraw all available
```

Recovery (if CLI crashes mid-withdrawal):
```bash
proxygate withdraw-confirm --tx <tx_signature>
```

## SDK (Programmatic)

For agent-to-agent use without CLI:

```typescript
import { ProxyGateClient, parseSSE } from '@proxygate/sdk';

const client = await ProxyGateClient.create({
  keypairPath: '~/.proxygate/keypair.json',
});

// Check balance
const { balance, available } = await client.balance();

// Browse APIs
const apis = await client.apis({ service: 'openai', verified: true });
const categories = await client.categories();
const services = await client.services();

// View listing docs
const docs = await client.docs('listing-id');

// Proxy a request
const res = await client.proxy('listing-id', '/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
});

// Stream with SSE
const res = await client.proxy('listing-id', '/v1/chat/completions',
  { model: 'gpt-4', messages: [...], stream: true },
  { stream: true }
);
for await (const event of parseSSE(res)) {
  process.stdout.write(event.data);
}

// Shield scanning
const res = await client.proxy('listing-id', '/path', body, { shield: 'strict' });

// Rate a seller
await client.rate({ request_id: 'req-id', is_positive: true });

// Usage & settlements
const usage = await client.usage({ service: 'openai', limit: 50 });
const settlements = await client.settlements({ role: 'buyer' });
```

## Success criteria

- [ ] Balance checked and sufficient for request
- [ ] Listing ID identified from apis/pricing output
- [ ] Proxy request returns upstream API response
- [ ] Usage reflects the completed request

## Related skills

| Need | Skill |
|------|-------|
| First-time setup | `pg-setup` |
| Buy API access | **This skill** |
| Sell API capacity | `pg-sell` |
| Job marketplace | `pg-jobs` |
| Check status | `pg-status` |
| Update CLI/SDK | `pg-update` |
