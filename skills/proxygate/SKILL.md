---
name: proxygate
description: "Proxygate CLI — the agentic commerce marketplace for AI agents. Use this skill whenever the user mentions Proxygate, proxy requests, API marketplace, USDC payments, Solana wallet, vault balance, listings, tunnels, sellers, buyers, or any topic related to the Proxygate platform. This is the router skill — it determines which sub-skill to invoke."
---

# Proxygate CLI Router

You are working with **Proxygate** — the agentic commerce marketplace for AI agents. A marketplace where sellers list API capacity and AI agents buy access through a transparent proxy, paying with USDC on Solana.

## How to route

Based on the user's intent, invoke the appropriate sub-skill using the `Skill` tool:

| User wants to... | Invoke skill |
|---|---|
| Set up Proxygate, install CLI, configure auth, connect gateway, login | `pg-setup` |
| Check balance, usage, earnings, listings, settlement history, status overview | `pg-status` |
| Browse APIs, deposit USDC, make proxy requests, stream responses, rate sellers, withdraw | `pg-buy` |
| Create listings, manage listings, rotate keys, upload docs, start tunnels, sell capacity, view earnings | `pg-sell` |
| Update CLI or SDK to latest version | `pg-update` |

## Routing rules

1. **Always route** — never answer Proxygate questions without loading the relevant sub-skill first
2. **Multiple skills** — if the user's request spans multiple areas (e.g. "check my balance and make a proxy call"), invoke the most relevant skill first
3. **When unclear** — if you can't determine intent, invoke `pg-status` to show an overview, then ask what they want to do

## Quick reference

```bash
proxygate --help          # all commands
proxygate login           # authenticate (API key or wallet)
proxygate whoami          # check auth mode + balance
proxygate balance         # check balance
proxygate apis            # browse APIs
proxygate proxy <service> /path -d '...'  # make a request
proxygate listings list   # your listings
proxygate tunnel          # expose local service
```

## Key facts

- Payments: USDC on Solana (1 USDC = 1,000,000 lamports)
- Auth: API key, wallet keypair, or WalletConnect (delegation token)
- Config: `~/.proxygate/config.json`
- Gateway: `https://gateway.proxygate.ai`
- Docs: `https://gateway.proxygate.ai/docs`
