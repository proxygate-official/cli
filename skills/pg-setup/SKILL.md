---
name: pg-setup
description: Use when setting up ProxyGate for the first time, installing the CLI, configuring auth (API key or wallet), or connecting to the gateway. Make sure to use this skill whenever someone mentions "get started with proxygate", "install proxygate", "setup wallet", "configure proxygate", "connect to gateway", "login", or wants to start using ProxyGate APIs, even if they don't explicitly say "setup".
metadata: {"openclaw":{"requires":{"anyBins":["npm","pnpm"]},"homepage":"https://proxygate.ai"}}
---

# ProxyGate Setup

First-time setup for ProxyGate — install CLI, authenticate, start using APIs.

## Authentication modes

ProxyGate supports multiple ways to authenticate, each suited to different use cases:

| Mode | Best for | What you get | On-chain ops? |
|------|----------|-------------|---------------|
| **API key** | AI agents, scripts, quick start | Scoped access with spend limits | No — deposit/withdraw via dashboard |
| **WalletConnect** | Interactive users with a mobile wallet | Delegation token (scoped, time-limited) | No — uses delegation token |
| **Import keypair** | Developers, sellers, full control | Full access, all operations | Yes — deposit, withdraw, settle |
| **Generate keypair** | New users without an existing wallet | Fresh Solana wallet with full access | Yes — but wallet starts empty |

### Why different methods?

- **API key** (`pg_live_*`): Simplest path. No Solana wallet needed. Get one at [app.proxygate.ai/wallets](https://app.proxygate.ai/wallets). Has configurable scopes and daily spend limits. Best for agents that only need to make proxy calls.
- **WalletConnect**: Connect your existing Phantom/Solflare wallet via QR code. Creates a **delegation token** (`pg_del_*`) — a time-limited, scoped JWT. No private key ever leaves your wallet.
- **Import keypair**: For users who already have a Solana keypair file. Gives full access including on-chain operations (deposit, withdraw). Required for sellers who want to receive settlement payouts.
- **Generate keypair**: Creates a fresh ed25519 keypair. Full access, but the wallet starts with 0 balance — you'll need to fund it with USDC.

### What can each mode do?

| Operation | API key | Delegation token | Keypair |
|-----------|---------|-------------------|---------|
| Browse APIs | Yes | Yes | Yes |
| Proxy requests | Yes | Yes (if `proxy` scope) | Yes |
| Check balance | Yes | Yes (if `balance:read` scope) | Yes |
| View usage | Yes | Yes (if `usage:read` scope) | Yes |
| Rate sellers | Yes | Yes (if `rate:write` scope) | Yes |
| Create listings | Yes (if `listings:write` scope) | Yes (if scope) | Yes |
| Start tunnel | Yes (if `tunnel` scope) | Yes (if scope) | Yes |
| Post/claim jobs | Yes (if `jobs:write` scope) | Yes (if scope) | Yes |
| Deposit USDC | No | No | Yes |
| Withdraw USDC | No | No | Yes |
| Revoke tokens | No | No | Yes |

**Don't have a Solana wallet yet?** Start with an **API key** — you can make proxy calls, browse APIs, and use the full marketplace. On-chain operations (deposit/withdraw) can be done through the web dashboard at [app.proxygate.ai](https://app.proxygate.ai). Onramping (buying USDC with fiat) and bridging (moving USDC from other chains) are coming soon.

## Process

### 1. Check existing install

```bash
proxygate --version 2>/dev/null || echo "NOT_INSTALLED"
proxygate whoami 2>/dev/null || echo "NOT_CONFIGURED"
```

- Installed and configured → skip to verify
- Installed but not configured → skip to authenticate
- Not installed → start from install

### 2. Install the CLI

```bash
npm install -g @proxygate/cli
# or
pnpm add -g @proxygate/cli
```

### 3. Authenticate

Run `proxygate login` for the interactive menu:

```
ProxyGate Login

  1. API key     Paste existing or create in browser
  2. Wallet      WalletConnect, import keypair, or generate new
```

**Option 1a: Paste API key**
```bash
proxygate login --key pg_live_abc123...
```
Get a key at [app.proxygate.ai/wallets](https://app.proxygate.ai/wallets).

**Option 1b: Create key in browser**
```bash
proxygate login
# Choose "API key" → "Create in browser"
# Opens app.proxygate.ai/wallets — copy the key and paste it
```

**Option 2a: WalletConnect (mobile wallet)**
```bash
proxygate login
# Choose "Wallet" → "WalletConnect (browser)"
# QR code appears in terminal — scan with Phantom/Solflare
# Wallet signs a nonce → CLI receives a delegation token
```

**Option 2b: Import existing keypair**
```bash
proxygate login --keypair ~/.config/solana/id.json
```
Supports: JSON array (64 numbers), seed (32 numbers), Base58 (Phantom export), Base64, Hex.

**Option 2c: Generate new keypair**
```bash
proxygate login --generate
```
Creates `~/.proxygate/keypair.json` (mode 0600). Back up this file!

### 4. Verify

```bash
proxygate whoami                    # check auth mode + balance
proxygate apis -q weather           # browse available APIs
proxygate proxy weather-api /       # make your first API call
```

### 5. Install Claude Code skills (optional)

```bash
proxygate skills install
```

## Auth management

```bash
proxygate whoami                    # check current auth mode
proxygate login --key pg_live_...   # add/change API key
proxygate login --keypair ~/id.json # add/change wallet
proxygate logout                    # remove API key (keep wallet)
proxygate logout --all              # remove all auth (with confirmation)
```

You can have both an API key and a keypair configured simultaneously — the CLI uses the appropriate one based on the operation.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `command not found: proxygate` | `npm install -g @proxygate/cli` |
| `Authentication failed` | Check your API key at app.proxygate.ai/wallets |
| `Not configured` | Run `proxygate login` |
| `Gateway unreachable` | Verify URL: `https://gateway.proxygate.ai` |
| `Delegation token expired` | Run `proxygate login` again (WalletConnect) |
| Balance shows 0 | Deposit via dashboard or keypair — see `pg-buy` |

## Success criteria

- [ ] CLI installed (`proxygate --version` returns a version)
- [ ] `proxygate whoami` shows auth mode and balance
- [ ] `proxygate apis` shows available APIs
- [ ] `proxygate proxy <service> <path>` returns a response

## Related skills

| Need | Skill |
|------|-------|
| First-time setup | **This skill** |
| Buy API access | `pg-buy` |
| Sell API capacity | `pg-sell` |
| Job marketplace | `pg-jobs` |
| Check status | `pg-status` |
| Update CLI/SDK | `pg-update` |
