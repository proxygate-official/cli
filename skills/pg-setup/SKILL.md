---
name: pg-setup
description: Use when setting up ProxyGate for the first time, installing the CLI, configuring a Solana wallet keypair, or connecting to the gateway. Make sure to use this skill whenever someone mentions "get started with proxygate", "install proxygate", "setup wallet", "configure proxygate", or wants to start using ProxyGate APIs, even if they don't explicitly say "setup".
---

# ProxyGate Setup

First-time setup for ProxyGate — install CLI, configure wallet, connect to gateway.

<purpose>
Walk the user through ProxyGate first-time setup: install the CLI, locate or create a Solana keypair, configure the gateway connection, and verify everything works.
</purpose>

<process>

<step name="check_existing_install">
Check if ProxyGate CLI is already installed:

```bash
proxygate --version 2>/dev/null || echo "NOT_INSTALLED"
```

If installed, check if configured:
```bash
cat ~/.proxygate/config.json 2>/dev/null || echo "NOT_CONFIGURED"
```

- If installed and configured: skip to verify step
- If installed but not configured: skip to configure step
- If not installed: start from install step
</step>

<step name="install_cli">
Install the CLI globally:

```bash
npm install -g @proxygate/cli
proxygate --version
```

If npm is not available, check for pnpm or yarn:
```bash
pnpm add -g @proxygate/cli   # alternative
```
</step>

<step name="find_or_create_keypair">
Locate an existing Solana keypair or create one.

Common locations to check:
```bash
ls ~/.config/solana/id.json 2>/dev/null
ls ~/.proxygate/keypair.json 2>/dev/null
```

If no keypair exists, create one:
```bash
solana-keygen new --outfile ~/.proxygate/keypair.json --no-bip39-passphrase
```

If `solana-keygen` is not installed, the CLI's `getting-started` command can generate one too.
</step>

<step name="configure">
Run the interactive setup (recommended for first time):

```bash
proxygate getting-started
```

Or configure manually:
```bash
proxygate init --keypair <path-to-keypair>
proxygate init --keypair ~/.proxygate/keypair.json --gateway https://gateway.proxygate.ai
```

Config is saved to `~/.proxygate/config.json`.
</step>

<step name="verify">
Test the connection:

```bash
proxygate balance
proxygate pricing
```

- If balance is 0: user needs to deposit USDC — hand off to `/pg-buy`
- If gateway unreachable: check `--gateway` URL
- If keypair error: check path in `~/.proxygate/config.json`
</step>

</process>

<troubleshooting>

| Problem | Fix |
|---------|-----|
| `command not found: proxygate` | `npm install -g @proxygate/cli` |
| `ENOENT keypair` | Check path in `~/.proxygate/config.json` |
| `Gateway unreachable` | Verify URL, try `https://gateway.proxygate.ai` |
| Balance shows 0 | Need to deposit: use `/pg-buy` |
| `solana-keygen: command not found` | Use `proxygate getting-started` instead (handles keypair creation) |

</troubleshooting>

<success_criteria>
- [ ] CLI installed and `proxygate --version` returns a version
- [ ] Keypair file exists and is readable
- [ ] `~/.proxygate/config.json` has `gatewayUrl` and `keypairPath`
- [ ] `proxygate balance` returns a response (even if 0)
- [ ] `proxygate pricing` shows available APIs
</success_criteria>

## Scope

| Need | Skill |
|------|-------|
| First-time setup | **This skill** (`pg-setup`) |
| Buy API access | `/pg-buy` |
| Sell API capacity | `/pg-sell` |
| Check status | `/pg-status` |
| Update CLI | `/pg-update` |

## Reference

For full CLI command reference, see [references/commands.md](references/commands.md).
