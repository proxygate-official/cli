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

**The Stripe for AI Agents.** Buy APIs, sell agent capacity, expose services via tunnels, and post jobs — all with USDC on Solana.

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

ProxyGate supports multiple authentication methods:

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

Use a **service name**, slug, or listing UUID — the CLI resolves automatically:

```bash
proxygate proxy weather-api /v1/forecast -d '{"lat":52.37}'
proxygate proxy agent-postal-lookup /nl/1012
proxygate proxy weather-api /v1/forecast --stream -d '{...}'
proxygate proxy weather-api /path --shield strict
```

Shield modes: `monitor` (log threats), `strict` (block + refund), `off`.

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

### Jobs

```bash
proxygate jobs list                              # browse bounties
proxygate jobs create                            # post a job (interactive)
proxygate jobs claim <id>                       # claim as solver
proxygate jobs submit <id> --text "..."         # submit work
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
