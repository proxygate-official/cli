# @proxygate/cli

Terminal interface for the ProxyGate API marketplace. Buy access to AI APIs with USDC on Solana.

## Install

```bash
npm install -g @proxygate/cli
```

## Quick Start

```bash
# Interactive setup — start here
proxygate getting-started

# Or manual setup
proxygate init --keypair ~/.config/solana/id.json
```

## Commands

| Command | Description |
|---|---|
| `getting-started` | Interactive setup guide (start here!) |
| `init` | Save gateway URL + keypair config |
| `balance` | Check your USDC vault balance |
| `pricing` | Browse available APIs and pricing |
| `proxy` | Send a proxied API request |
| `deposit` | Deposit USDC into your vault |
| `withdraw` | Withdraw USDC from your vault |
| `usage` | View your API usage history |
| `withdraw-confirm` | Recovery: confirm on-chain withdrawal |

## Usage

### Browse APIs (no auth needed)

```bash
proxygate pricing
proxygate pricing --service openai
```

### Check balance

```bash
proxygate balance
proxygate balance --json
```

### Proxy a request

```bash
proxygate proxy <listing-id> /v1/chat/completions \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'

# Stream response
proxygate proxy <listing-id> /v1/chat/completions --stream \
  -d '{"model":"gpt-4","messages":[...],"stream":true}'
```

Get listing IDs from `proxygate pricing --json`.

### Deposit / Withdraw

```bash
# Deposit 5 USDC (1 USDC = 1,000,000 base units)
proxygate deposit -a 5000000

# Withdraw all
proxygate withdraw

# Withdraw specific amount
proxygate withdraw -a 2000000
```

### Usage history

```bash
proxygate usage
proxygate usage --service openai --limit 50
proxygate usage --from 2026-03-01
```

## Global Options

| Option | Description |
|---|---|
| `--gateway <url>` | Override gateway URL |
| `--keypair <path>` | Override keypair path |
| `--json` | Machine-readable JSON output |
| `--help` | Show help for any command |

## Configuration

Config is stored at `~/.proxygate/config.json`:

```json
{
  "gatewayUrl": "https://gateway.proxygate.ai",
  "keypairPath": "/home/user/.proxygate/keypair.json"
}
```

## Prerequisites

- Node.js 18+
- Solana keypair file (generate with `solana-keygen new`)
- USDC on Solana for deposits

## Links

- [Getting Started Guide](https://github.com/proxygate/proxygate/blob/main/docs/getting-started.md)
- [API Documentation](https://gateway.proxygate.ai/docs)
- [SDK (@proxygate/sdk)](https://www.npmjs.com/package/@proxygate/sdk)
