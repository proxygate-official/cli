# @proxygate/cli release notes

## 0.6.1 — proxy UX: clearer spend-limit + endpoint hint on 4xx

Two agent-UX fixes for the `proxygate proxy` command.

- **Spend-limit display now shows "spent today" instead of "remaining"**:
  - Old: `limit: $4.99/$5.00 remaining` (1 cent spent looked like a near-limit warning)
  - New: `spent today: $0.01 / $5.00` (matches mental model — what you've used)
  - The yellow >80% threshold is unchanged in behavior, just inverted in display.
- **Endpoint hint on non-2xx responses**: when an upstream returns 4xx/5xx, the CLI
  now best-effort looks up the listing's documented endpoints (from the listing's
  registered `endpoints[]` metadata — works whether or not the seller uploaded a
  full OpenAPI spec) and prints them inline:
  ```
  Status: 404

  Hint: This listing supports these endpoints:
    GET    /api/v3/simple/price                  Current price for coin IDs
    POST   /v1/evm/raw/function-results (body)   Time-travel function call lookup
    ...
  For request body schemas: proxygate listings docs <id> --raw
  ```
  POST/PUT/PATCH endpoints are flagged `(body)` so agents know they need a body
  schema. The hint suggests `listings docs --raw` for write endpoints and the
  default `listings docs` for read-only listings. 5 s timeout, silent on failure.

## 0.6.0 — Phase 51.5: free-tier rendering

Requires `@proxygate/sdk@^0.7.0` (SAFE-06 minor bump, additive).

- `proxygate apis` (alias `proxygate search`) now renders a cyan **FREE** badge
  in the Price column for ProxyGate-procured listings (e.g. Open-Meteo). The
  badge appears in both the default table layout and the compact (`--compact`)
  variant. The `--json --compact` form gains an extra `free: boolean` field
  per row for scripted consumers.
- `proxygate listings list --table` renders **FREE** in the Price column for
  the seller's own procured-flagged listings.
- Error handler maps `daily_free_cap` (HTTP 429) to: "Daily free limit reached
  for this listing. Deposit USDC for unlimited paid calls, or wait until 00:00
  UTC."
- Error handler maps `listing_quota_exhausted` (HTTP 429) to a similar message
  advising to try a paid listing for the same service or retry tomorrow.

## 0.5.5 — previous release

See git history.
