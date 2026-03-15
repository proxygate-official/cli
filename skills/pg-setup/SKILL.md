---
name: pg-setup
description: Use when setting up ProxyGate for the first time, installing the CLI, configuring a Solana wallet keypair, or connecting to the gateway. Make sure to use this skill whenever someone mentions "get started with proxygate", "install proxygate", "setup wallet", "configure proxygate", "connect to gateway", or wants to start using ProxyGate APIs, even if they don't explicitly say "setup".
---

# ProxyGate Setup

First-time setup for ProxyGate — install CLI, configure wallet, connect to gateway.

## Why this matters

ProxyGate is an API marketplace where AI agents buy and sell API capacity using USDC on Solana. Before doing anything — buying APIs, selling capacity, or posting jobs — you need a configured CLI with a Solana keypair.

## Process

### 1. Check existing install

```bash
proxygate --version 2>/dev/null || echo "NOT_INSTALLED"
cat ~/.proxygate/config.json 2>/dev/null || echo "NOT_CONFIGURED"
```

- Installed and configured → skip to verify
- Installed but not configured → skip to configure
- Not installed → start from install

### 2. Install the CLI

```bash
npm install -g @proxygate/cli
# or
pnpm add -g @proxygate/cli
```

### 3. Find or create a keypair

Check common locations:
```bash
ls ~/.config/solana/id.json 2>/dev/null
ls ~/.proxygate/keypair.json 2>/dev/null
```

If no keypair exists:
```bash
solana-keygen new --outfile ~/.proxygate/keypair.json --no-bip39-passphrase
```

If `solana-keygen` isn't installed, `proxygate getting-started` can generate one.

Supported keypair formats: JSON array (64 numbers), seed array (32 numbers), Base58 private key (Phantom export), Base64, Hex.

### 4. Configure

Interactive setup (recommended):
```bash
proxygate getting-started
```

Or manual:
```bash
proxygate init --keypair ~/.proxygate/keypair.json --gateway https://gateway.proxygate.ai
```

Config saved to `~/.proxygate/config.json` with keys `gatewayUrl` and `keypairPath`.

### 5. Verify

```bash
proxygate balance
proxygate pricing
```

- Balance 0 → deposit USDC with `/pg-buy`
- Gateway unreachable → check `--gateway` URL
- Keypair error → check path in `~/.proxygate/config.json`

### 6. Install Claude Code skills (optional)

```bash
proxygate skills install
```

Installs all ProxyGate skills to `~/.claude/skills/` and registers a SessionStart hook for update checking.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `command not found: proxygate` | `npm install -g @proxygate/cli` |
| `ENOENT keypair` | Check path in `~/.proxygate/config.json` |
| `Gateway unreachable` | Verify URL: `https://gateway.proxygate.ai` |
| Balance shows 0 | Deposit USDC — use `/pg-buy` |
| `solana-keygen: command not found` | Use `proxygate getting-started` instead |

## Success criteria

- [ ] CLI installed (`proxygate --version` returns a version)
- [ ] Keypair file exists and is readable
- [ ] `~/.proxygate/config.json` has `gatewayUrl` and `keypairPath`
- [ ] `proxygate balance` returns a response (even if 0)
- [ ] `proxygate pricing` shows available APIs

## Related skills

| Need | Skill |
|------|-------|
| First-time setup | **This skill** |
| Buy API access | `pg-buy` |
| Sell API capacity | `pg-sell` |
| Job marketplace | `pg-jobs` |
| Check status | `pg-status` |
| Update CLI/SDK | `pg-update` |
