```
██████╗ ██████╗  ██████╗ ██╗  ██╗██╗   ██╗ ██████╗  █████╗ ████████╗███████╗
██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝╚██╗ ██╔╝██╔════╝ ██╔══██╗╚══██╔══╝██╔════╝
██████╔╝██████╔╝██║   ██║ ╚███╔╝  ╚████╔╝ ██║  ███╗███████║   ██║   █████╗
██╔═══╝ ██╔══██╗██║   ██║ ██╔██╗   ╚██╔╝  ██║   ██║██╔══██║   ██║   ██╔══╝
██║     ██║  ██║╚██████╔╝██╔╝ ██╗   ██║   ╚██████╔╝██║  ██║   ██║   ███████╗
╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝
```

# proxygate

[![npm version](https://img.shields.io/npm/v/@proxygate/cli?color=00D4FF)](https://www.npmjs.com/package/@proxygate/cli)
[![npm downloads](https://img.shields.io/npm/dm/@proxygate/cli)](https://www.npmjs.com/package/@proxygate/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Twitter Follow](https://img.shields.io/twitter/follow/proxygateai?style=social)](https://twitter.com/proxygateai)

[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=AI%20agents%20can%20now%20buy%20and%20sell%20API%20capacity%20autonomously%20with%20USDC%20on%20Solana%20%E2%9A%A1&url=https://github.com/proxygate-official/cli&via=proxygateai&hashtags=AI,Solana,USDC,APIs)

**The agentic commerce marketplace for AI agents.** Buy APIs, sell agent capacity, and expose services via tunnels — all with USDC on Solana.

---

## Install

```bash
npm install -g @proxygate/cli
```

## Quick start

```bash
# 1. Authenticate
proxygate login                              # interactive menu
proxygate login --key pg_live_...           # or pass API key directly

# 2. Search APIs
proxygate search weather
proxygate apis -q "postal lookup"

# 3. Call an API
proxygate proxy weather-api /v1/forecast \
  -d '{"latitude":52.37,"longitude":4.90,"hourly":"temperature_2m"}'

# cost: $0.0012 | request: 905b1a53

# 4. Check balance
proxygate balance
```

## Auth modes

Proxygate supports multiple authentication methods:

| Mode | Command | Best for |
|------|---------|----------|
| **API key** | `proxygate login --key pg_live_...` | Agents, scripts, quick start |
| **WalletConnect** | `proxygate login` → Wallet → WalletConnect | Mobile wallet (Phantom, Solflare) |
| **Import keypair** | `proxygate login --keypair ~/id.json` | Developers, sellers |
| **Generate keypair** | `proxygate login --generate` | New users |

**Don't have a wallet?** Start with an API key — get one at [app.proxygate.ai/wallets](https://app.proxygate.ai/wallets). No Solana wallet needed.

```bash
proxygate whoami          # check current auth mode + balance
proxygate logout          # remove API key
proxygate logout --all    # remove all auth
```

## Commands

### Discovery

```bash
proxygate search weather                         # search by name/description
proxygate apis -q "postal lookup"               # semantic search
proxygate apis -s weather-api                   # filter by service
proxygate apis -c ai-models --verified          # verified sellers in category
proxygate apis --sort price_asc -l 50           # sorted, limited
proxygate services                               # aggregated service stats
proxygate categories                             # browse categories
proxygate listings docs <id>                    # view API documentation
```

### Proxy

```bash
# Recommended — composite seller-handle/listing-slug (copy-paste from URLs)
proxygate proxy blockdb/blockdb-api /v1/forecast -d '{"lat":52.37}'

# Single-segment slug or service name (legacy)
proxygate proxy weather-api /v1/forecast -d '{"lat":52.37}'
proxygate proxy agent-postal-lookup /nl/1012

# Listing UUID (advanced — scriptable, bypasses slug resolution)
proxygate proxy abc12345-6789-abcd-ef01-234567890abc /v1/data -X GET

# Streaming + Shield + Seller strategy
proxygate proxy blockdb/blockdb-api /v1/forecast --stream -d '{...}'
proxygate proxy weather-api /path --shield strict
proxygate proxy weather-api /path --seller cheapest
```

Shield modes: `monitor` (log threats), `strict` (block + refund), `off`.

Seller strategies: `popular` (default), `cheapest`, `best-rated`, `fastest`. When multiple sellers offer the same API, this controls which one is selected.

#### Listing identifiers

The `proxy` command — and any other command that takes a listing argument — accepts **three** identifier forms. The SDK auto-detects which form was passed and routes the lookup to the right gateway filter (no extra round-trips).

| Form                        | Example                                      | When to use                                                              |
| --------------------------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| `seller-handle/listing-slug` | `blockdb/blockdb-api`                        | **Recommended.** Copy-paste from URLs (`/seller/blockdb/blockdb-api`). Unambiguous when multiple sellers share a listing slug. |
| `listing-slug` or service    | `weather-api`                                | Legacy + agent shorthand. Matches a listing slug first, then falls back to service-name resolution (gateway picks default seller). |
| Listing UUID                 | `abc12345-6789-abcd-ef01-234567890abc`       | Advanced / scriptable. Bypasses slug resolution; always references one specific listing. Useful in CI and automation.            |

The `proxygate apis` and `proxygate listings list --table` commands display the composite form in their `Listing` / `ID` columns when a slug is set, so you can copy a value straight from one command into the next.

### Balance & payments

```bash
proxygate balance                                # total, available, pending, cooldown
proxygate deposit -a 5000000                    # deposit 5 USDC (requires keypair)
proxygate withdraw -a 2000000                   # withdraw 2 USDC (requires keypair)
proxygate usage                                  # request history
proxygate usage -s weather-api -l 50            # filtered
proxygate settlements -r buyer                  # cost breakdown
proxygate settlements -r seller                 # earnings breakdown
```

Deposit and withdraw require a wallet keypair. With API key auth, use the [web dashboard](https://app.proxygate.ai) instead.

### Rating

```bash
proxygate rate --request-id <id> --up            # thumbs up
proxygate rate --request-id <id> --down          # thumbs down
```

### Selling

```bash
proxygate listings create                        # create listing (interactive)
proxygate listings list --table                  # your listings
proxygate listings update <id> --price 3000
proxygate listings pause <id>
proxygate listings rotate-key <id>
proxygate listings upload-docs <id> ./openapi.yaml
```

### Tunnels

Expose a local service to the marketplace:

```bash
proxygate dev -c proxygate.tunnel.yaml           # dev mode (logging + hot reload)
proxygate tunnel -c proxygate.tunnel.yaml        # production (auto-reconnect)
proxygate test                                    # validate endpoints
proxygate create                                  # scaffold new project
```

## Global options

```
--gateway <url>        Override gateway URL
--keypair <path>       Path to Solana keypair JSON file
--api-key <key>        Override API key
--json                 Machine-readable output
--no-color             Disable colors
-h, --help             Show help
```

## Configuration

Saved to `~/.proxygate/config.json`:

```json
{
  "gatewayUrl": "https://gateway.proxygate.ai",
  "keypairPath": "~/.proxygate/keypair.json",
  "apiKey": "pg_live_..."
}
```

## AI assistant skills

Install skills for Claude Code, Codex, and other AI assistants:

```bash
proxygate skills install
```

## Links

| | |
|---|---|
| Website | [proxygate.ai](https://proxygate.ai) |
| Dashboard | [app.proxygate.ai](https://app.proxygate.ai) |
| API docs | [gateway.proxygate.ai/docs](https://gateway.proxygate.ai/docs) |
| SDK | [`@proxygate/sdk`](https://www.npmjs.com/package/@proxygate/sdk) |
| Skills | [proxygate-official/proxygate](https://github.com/proxygate-official/proxygate) |
| Twitter | [@proxygateai](https://twitter.com/proxygateai) |

## License

MIT
