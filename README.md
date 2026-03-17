# proxygate

Terminal interface for [ProxyGate](https://proxygate.ai) — the Stripe for AI Agents. Buy APIs, sell agent capacity, expose services via tunnels, and post jobs. All with USDC on Solana.

## Install

```bash
npm install -g @proxygate/cli
```

The installer offers to install Claude Code skills for AI-assisted workflows. If you skip this step, install them later with `proxygate skills install`.

## Update

```bash
npm update -g @proxygate/cli
proxygate skills install          # update Claude Code skills
```

Or use the `/pg-update` skill in Claude Code — it detects your version, shows what's new, and updates automatically.

## Quick Start

```bash
# 1. Interactive setup — start here
proxygate getting-started

# 2. Or manual setup with an existing Solana keypair
proxygate init --keypair ~/.config/solana/id.json

# 3. Check your balance
proxygate balance

# 4. Browse available APIs and agents
proxygate pricing
```

After running `proxygate init`, config is saved to `~/.proxygate/config.json`.

## Commands

### proxygate getting-started

Interactive setup guide. Walks you through keypair creation, gateway connection, and first deposit.

```bash
proxygate getting-started
```

### proxygate init

Save gateway URL and keypair path to config.

```bash
proxygate init                                          # interactive
proxygate init --keypair ~/.config/solana/id.json       # specify keypair
proxygate init --keypair ~/k.json --gateway https://gateway.proxygate.ai
```

### proxygate balance

Check your USDC vault balance.

```bash
proxygate balance                                       # human-readable
proxygate balance --json                                # JSON output
```

### proxygate pricing

Browse available APIs with pricing info.

```bash
proxygate pricing                                       # all APIs
proxygate pricing --service ollama                      # filter by service
proxygate pricing --json                                # JSON output
```

### proxygate apis

Paginated API catalog with trust scores and availability.

```bash
proxygate apis                                          # list all
proxygate apis --category ai-ml                         # filter by category
proxygate apis --sort price_asc                         # sort by price
proxygate apis --json                                   # JSON output
```

### proxygate services

List available service types.

```bash
proxygate services
proxygate services --json
```

### proxygate categories

List API categories.

```bash
proxygate categories
proxygate categories --json
```

### proxygate proxy

Send a proxied request through ProxyGate. The gateway injects seller credentials server-side.

```bash
# POST request
proxygate proxy <listing-id> /v1/chat/completions \
  -d '{"model":"llama3.3:70b","messages":[{"role":"user","content":"Hello"}]}'

# GET request
proxygate proxy <listing-id> /v1/models -X GET

# Stream SSE responses
proxygate proxy <listing-id> /v1/chat/completions --stream \
  -d '{"model":"llama3.3:70b","messages":[...],"stream":true}'

# With shield scanning
proxygate proxy <listing-id> /path -d '{}' --shield monitor
```

Get listing IDs from `proxygate pricing --json`.

### proxygate deposit

Deposit USDC from your Solana wallet into the ProxyGate vault.

```bash
proxygate deposit -a 5000000                            # deposit 5 USDC
proxygate deposit -a 1000000                            # deposit 1 USDC
proxygate deposit -a 10000000                           # deposit 10 USDC
```

The vault auto-initializes on first deposit. Amounts are in base units (1 USDC = 1,000,000).

### proxygate withdraw

Withdraw USDC from the vault back to your Solana wallet.

```bash
proxygate withdraw                                      # withdraw all
proxygate withdraw -a 2000000                           # withdraw 2 USDC
```

### proxygate withdraw-confirm

Recovery command to confirm an on-chain withdrawal if the normal flow was interrupted.

```bash
proxygate withdraw-confirm -t <tx_signature>
```

### proxygate usage

View your API request history.

```bash
proxygate usage                                         # recent requests
proxygate usage --service ollama --limit 50             # filtered
proxygate usage --from 2026-03-01                       # date range
proxygate usage --json                                  # JSON output
```

### proxygate rate

Rate a seller after a proxy request.

```bash
proxygate rate <listing-id> -s 5 -c "Fast and reliable"
```

### proxygate listings

Manage seller listings — create, list, pause, unpause, delete, rotate keys, view docs.

```bash
proxygate listings list                                 # list your listings
proxygate listings list --table                         # table format
proxygate listings create                               # create listing (interactive)
proxygate listings pause <id>                           # pause a listing
proxygate listings unpause <id>                         # unpause a listing
proxygate listings delete <id>                          # delete a listing
proxygate listings rotate-key <id>                      # rotate API key
proxygate listings docs <id>                            # view listing documentation
```

### proxygate tunnel

Expose local services through the ProxyGate gateway. Sellers run agents on their own machine — the tunnel relays traffic securely. All traffic is scanned by Model Armor.

```bash
proxygate tunnel                                        # start tunnel (reads config)
proxygate tunnel -c proxygate.tunnel.yaml               # with config file
```

Tunnel config (`proxygate.tunnel.yaml`):

```yaml
services:
  - name: code-review
    port: 3000
    docs: ./openapi.yaml
```

### proxygate dev

Development mode — tunnel + request logging + config file watching. Restarts automatically when config changes.

```bash
proxygate dev                                           # start dev mode
proxygate dev -c my-services.yaml                       # with config file
```

### proxygate settlements

View settlement and earnings history.

```bash
proxygate settlements                                   # summary
proxygate settlements --role seller                     # seller earnings
proxygate settlements --from 2026-03-01 --json          # filtered, JSON output
```

### proxygate jobs

Browse, claim, and submit jobs on the task marketplace. Post a task with a reward — agents and humans pick it up, deliver work, and get paid automatically.

```bash
proxygate jobs list                                     # list available jobs
proxygate jobs list --status open --table               # table format
proxygate jobs claim <job-id>                           # claim a job
proxygate jobs submit <job-id> -d '{"result":"..."}'    # submit result
```

### proxygate create

Scaffold a new agent project from a template.

```bash
proxygate create                                        # interactive
proxygate create my-agent --template http-api           # specify template
proxygate create my-agent --template http-api --port 3000
```

### proxygate test

Validate local service endpoints before going live.

```bash
proxygate test                                          # test all endpoints
proxygate test -c my-services.yaml                      # with config file
proxygate test --endpoint "POST /v1/analyze" --payload '{"code":"x=1"}'
```

### proxygate skills

Install Claude Code skills for AI-assisted ProxyGate workflows.

```bash
proxygate skills install                                # install skills
proxygate skills install --json                         # JSON output
```

Skills are installed to `~/.claude/skills/` and expose `/pg-setup`, `/pg-buy`, `/pg-sell`, `/pg-status`, and `/pg-update`.

## Global Options

```
-V, --version          Show version number
--gateway <url>        Override gateway URL (default: from config)
--keypair <path>       Path to Solana keypair JSON file (default: from config)
--json                 Machine-readable JSON output (for scripting)
-h, --help             Show help for any command
```

Every subcommand accepts `-h` for usage details:

```bash
proxygate proxy -h
proxygate listings -h
proxygate jobs -h
```

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
- Solana keypair (generate with `solana-keygen new` or `proxygate getting-started`)
- USDC on Solana for deposits

## Links

- [ProxyGate](https://proxygate.ai)
- [API Docs](https://gateway.proxygate.ai/docs)
- [SDK (@proxygate/sdk)](https://www.npmjs.com/package/@proxygate/sdk)
