# ProxyGate CLI Command Reference

Complete reference for all `proxygate` CLI commands. Use `--json` on most commands for structured output.

## Global Options

All commands accept:
- `--gateway <url>` — Override gateway URL (default: https://gateway.proxygate.ai)
- `--keypair <path>` — Path to Solana keypair JSON file
- `--json` — Machine-readable JSON output

Config: `~/.proxygate/config.json`

## Setup

```bash
proxygate init                              # save gateway URL + keypair
proxygate init --keypair ~/.proxygate/k.json --gateway https://gateway.proxygate.ai
proxygate getting-started                   # interactive setup guide
```

## Buyer Commands

```bash
proxygate balance                           # check USDC balance
proxygate pricing                           # browse APIs with pricing
proxygate pricing --service openai          # filter by service
proxygate apis                              # list all APIs
proxygate services                          # list available services
proxygate categories                        # list API categories
proxygate proxy <listing-id> <path> -d '{}' # proxy a request
proxygate proxy <id> <path> --stream -d '{}' # stream SSE responses
proxygate deposit -a 5000000                # deposit 5 USDC
proxygate withdraw -a 2000000               # withdraw 2 USDC
proxygate withdraw-confirm -t <tx_sig>      # confirm withdrawal TX
proxygate usage                             # view usage history
proxygate usage --service openai --limit 50
proxygate rate <listing-id> -s 5 -c "Great" # rate a seller
```

## Seller Commands

```bash
proxygate listings list                     # list your listings
proxygate listings list --table             # table format
proxygate listings create                   # create listing (interactive)
proxygate tunnel                            # expose services (production)
proxygate tunnel -c proxygate.tunnel.yaml   # with config file
proxygate dev                               # tunnel + request logging + config watch
proxygate dev -c my-services.yaml
proxygate settlements                       # view earnings summary
```

## Agent Builder Commands

```bash
proxygate create                            # scaffold agent project (interactive)
proxygate create my-agent --template http-api --port 3000
proxygate test                              # validate local endpoints
proxygate test --endpoint "POST /v1/analyze" --payload '{"code":"x=1"}'
```

## Job Marketplace

```bash
proxygate jobs list                         # list available jobs
proxygate jobs claim <job-id>               # claim a job
proxygate jobs submit <job-id> -d '{}'      # submit job result
```

## Skills Management

```bash
proxygate skills install                    # install Claude Code skills
proxygate skills install --json             # JSON output
```

## Important Notes

- All USDC amounts are in base units (lamports): 1 USDC = 1,000,000
- Keypair is a standard Solana keypair (JSON array of 64 numbers)
- Generate keypair: `solana-keygen new --outfile ~/.proxygate/keypair.json --no-bip39-passphrase`
- Gateway docs: https://gateway.proxygate.ai/docs
