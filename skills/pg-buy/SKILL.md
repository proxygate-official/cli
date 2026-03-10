---
name: pg-buy
description: Use when buying API access through ProxyGate — depositing USDC, browsing available APIs, making proxy requests, or streaming responses. Make sure to use this skill whenever someone mentions "proxy request", "buy API", "deposit USDC", "browse APIs", "call API through proxygate", "make an API call", or wants to consume any API through ProxyGate, even if they don't explicitly say "buy".
---

# ProxyGate — Buy API Access

Buyer workflow: deposit USDC, discover APIs, proxy requests, stream responses.

<purpose>
Help the user find APIs on ProxyGate, deposit USDC credits, send proxy requests, and manage their balance. Covers the full buyer lifecycle from funding to API consumption.
</purpose>

<required_reading>
Verify CLI is configured first: `proxygate balance`. If this fails, use `/pg-setup` before continuing.
</required_reading>

<process>

<step name="check_balance">
Check current balance to determine if deposit is needed:

```bash
proxygate balance
```

If balance is 0 or insufficient, proceed to deposit step.
If balance is sufficient, skip to discover step.
</step>

<step name="deposit">
Deposit USDC from Solana wallet into ProxyGate vault:

```bash
# Amount in lamports (1 USDC = 1,000,000)
proxygate deposit -a 5000000    # deposit 5 USDC
proxygate deposit -a 1000000    # deposit 1 USDC
proxygate deposit -a 10000000   # deposit 10 USDC
```

Verify deposit:
```bash
proxygate balance
```

The vault auto-initializes on first deposit. User needs USDC in their Solana wallet.
</step>

<step name="discover_apis">
Browse available APIs and find a listing ID:

```bash
proxygate pricing                           # all APIs with pricing
proxygate pricing --service openai          # filter by service
proxygate pricing --json                    # machine-readable for parsing
proxygate apis                              # list all APIs
proxygate services                          # list services
proxygate categories                        # list categories
```

Note the `listing-id` from the output — needed for proxy requests.
</step>

<step name="proxy_request">
Send a request through ProxyGate:

```bash
# Basic request
proxygate proxy <listing-id> /v1/chat/completions \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'

# GET request
proxygate proxy <listing-id> /v1/models -X GET

# Stream SSE responses
proxygate proxy <listing-id> /v1/chat/completions --stream \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}],"stream":true}'

# With shield scanning
proxygate proxy <listing-id> /path -d '{}' --shield monitor
```

The listing ID determines which seller and service. Get IDs with: `proxygate pricing --json`
</step>

<step name="check_usage">
Review usage and remaining balance:

```bash
proxygate balance                           # current balance
proxygate usage                             # request history
proxygate usage --service openai --limit 50 # filtered
proxygate usage --json                      # machine-readable
```
</step>

<step name="withdraw">
Convert credits back to USDC (optional):

```bash
proxygate withdraw -a 2000000               # withdraw 2 USDC
proxygate withdraw                          # withdraw all
```

After initiating, confirm with TX signature:
```bash
proxygate withdraw-confirm -t <tx_signature>
```
</step>

</process>

## SDK (Programmatic)

For agent-to-agent use without the CLI:

```typescript
import { ProxyGateClient } from '@proxygate/sdk';

const client = await ProxyGateClient.create({
  keypairPath: '~/.proxygate/keypair.json',
});

// Check balance
const balance = await client.balance();

// Proxy a request
const res = await client.proxy('listing-id', '/v1/chat/completions', {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

<success_criteria>
- [ ] Balance checked and sufficient for request
- [ ] Listing ID identified from pricing/apis output
- [ ] Proxy request returns upstream API response
- [ ] Usage reflects the completed request
</success_criteria>

## Scope

| Need | Skill |
|------|-------|
| First-time setup | `/pg-setup` |
| Buy API access | **This skill** (`pg-buy`) |
| Sell API capacity | `/pg-sell` |
| Check status | `/pg-status` |
| Update CLI | `/pg-update` |

## Reference

For full CLI command reference, see [references/commands.md](references/commands.md).
