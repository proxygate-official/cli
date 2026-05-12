# @proxygate/cli release notes

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
