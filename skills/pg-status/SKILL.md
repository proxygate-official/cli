---
name: pg-status
description: Use when checking ProxyGate status — balance, usage, listings, tunnel health, or earnings. Make sure to use this skill whenever someone mentions "check balance", "proxygate status", "my usage", "my earnings", "what's my balance", "how much have I spent", or wants any kind of status overview.
---

# ProxyGate Status

Quick status checks for buyers and sellers.

<process>

<step name="buyer_status">
```bash
proxygate balance                  # USDC balance + pending settlement
proxygate usage                    # recent request history
proxygate usage --limit 10         # last 10 requests
proxygate usage --json             # machine-readable
```
</step>

<step name="seller_status">
```bash
proxygate listings list            # active listings
proxygate listings list --table    # table format
proxygate settlements              # earnings summary
```
</step>

</process>

<troubleshooting>

| Symptom | Check |
|---------|-------|
| Balance 0 | `proxygate deposit -a <amount>` — see `/pg-buy` |
| Proxy returns 503 | Listing may be paused or seller tunnel is down |
| "Unauthorized" | Run `proxygate init` to reconfigure keypair — see `/pg-setup` |
| Tunnel disconnects | Check `proxygate dev` logs, verify local port is open |
| Gateway unreachable | Verify URL: `proxygate balance --gateway https://gateway.proxygate.ai` |

</troubleshooting>

## Scope

| Need | Skill |
|------|-------|
| First-time setup | `/pg-setup` |
| Buy API access | `/pg-buy` |
| Sell API capacity | `/pg-sell` |
| Check status | **This skill** (`pg-status`) |
| Update CLI | `/pg-update` |
