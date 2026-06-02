# @proxygate/cli release notes

## 0.9.0 — Username hard-proxy-gate (client side)

Additive, non-breaking at the export level (SAFE-06 minor).

- **`proxygate init` now sets a REQUIRED username.** New `--username <name>`
  flag (3-32 chars, lowercase letters/digits, single dashes). Resolution:
  `--username` if passed; else prompt when interactive (TTY), looping until
  non-empty; else (non-TTY, no `--username`) exit(1) with
  "A username is required. Pass --username <name>." Submitted via the SDK
  `client.setUsername`.
- **Collision UX.** On `username_taken` the CLI prints "That username is taken,
  pick another" and re-prompts when interactive, or exits(1) when non-TTY.
- **Submission is offline-tolerant.** A gateway/network failure during submit
  warns and does NOT abort init (mirrors the balance + email try/catch); the
  server-side gate re-prompts via `registration_required` on the next proxy
  call. `--email` remains optional and unchanged. `login` does NOT require a
  username (unchanged behavior).
- **`registration_required` surfacing confirmed:** `handleError` already renders
  `err.action` for any `ProxygateError`, and the gateway sends
  `registration_required` with an action pointer ("Run 'proxygate init'"), so it
  is surfaced as-is — no `handleError`/`ERROR_HINTS` change.

## 0.8.0 — Fase 1: contact-email capture

Additive, non-breaking (SAFE-06 minor).

- **`proxygate init --email <email>`** (optional). Submits a contact email for
  the wallet via the SDK `setContactEmail` and prints
  `Verification email sent to <email>`. Email capture only runs when `--email`
  is provided OR `init` is running interactively in a TTY (it prompts, Enter to
  skip). Headless / autonomous wallets (no TTY, no `--email`) skip silently so
  the flow never hangs on stdin. Email submission is best-effort: a failure is
  printed but NEVER aborts `init` (config is still saved), mirroring the
  existing balance-probe behavior.
- **On a collision** (`verification_required` / `email_conflict`), `init` prints
  the gateway's `action` / `docs` web-claim pointer ("sign in with the original
  method, link your wallet in Settings") and continues. It does not crash.
- **New command `proxygate verify-email --token <token>`** → calls the SDK
  `verifyContactEmail`. Human + `--json` output. On the collision path,
  `handleError` surfaces the `action` / `docs` pointer.
- The heavy web-claim path is Fase 2; the CLI only detects + surfaces it.

Requires `@proxygate/sdk` >= 0.9.0 (the `setContactEmail` / `verifyContactEmail`
methods). No commands or flags were removed.

> Publish manually with `pnpm publish --no-git-checks` (NOT `npm publish` — see
> CLAUDE.md DO list).

## 0.7.1 — Cross-platform postinstall

Patch release (SAFE-06 patch). No API changes.

- **Fixed: postinstall never ran.** `dist/postinstall.js` was not emitted by the
  esbuild config — `src/postinstall.ts` was not in `entryPoints`. The shell-level
  `|| true` fallback masked the resulting `MODULE_NOT_FOUND` on macOS/Linux. On
  Windows `cmd` does not recognize `true`, so the error cascaded loudly.
  Consequence: skills auto-install, update-check hook registration, and
  statusline installation never happened on `npm i -g @proxygate/cli`. Users who
  did not run `proxygate skills install` manually had none of these.
- **Build**: `scripts/build.mjs` now includes `src/postinstall.ts` as a second
  entry point, so `dist/postinstall.js` is actually produced.
- **`package.json` postinstall**: replaced shell `|| true` with a Node-level
  guard (`node -e "import('./dist/postinstall.js').catch(...)"`). Works
  identically on Windows, macOS, and Linux. Missing files and internal errors
  log a warning instead of failing `npm install`.
- **New: `skills/pg-update/scripts/check-update.js`**. Node port of
  `check-update.sh`. Works on Windows without Git Bash or WSL.
- **`src/postinstall.ts`**: SessionStart hook now registers `node "..js"` instead
  of `bash "..sh"`. Existing entries pointing at `check-update.sh` (from old
  installs that registered manually) are migrated to the new `.js` script in
  place, no duplicates.

> Publish manually with `pnpm publish --no-git-checks` (NOT `npm publish` — see
> CLAUDE.md DO list).

## 0.7.0 — Phase 51.6: open free listings

Additive, non-breaking (SAFE-06 minor). Pairs with `@proxygate/sdk` 0.8.0.

- **`proxygate listings create --free`**: shortcut for `--price 0`. Lands the
  listing in "Pending approval" state until an admin sets `free_listing_approved`
  on the row. Combine with `--endpoint-price /path=micro-usdc` for free-default
  listings with paid endpoint overrides (matrix row 4).
- **`proxygate listings create --price 0`**: same effect, explicit zero. The
  `--price` flag help text is updated to document the new 0-OR->=1000 contract.
- **`--free` overrides `--price`**: passing both prints a `--free overrides --price`
  warning and uses `price=0`.
- **Interactive flow**: the create wizard now asks "Make this listing free
  (price=0, pending admin approval)?" before the price prompt.
- **Mixed-pricing both directions** (no CLI flag change): `--free-endpoint` and
  `--endpoint-price` from 0.6.x already cover the mixed-pricing matrix. With
  Phase 51.6 the gateway now accepts the full matrix:
  - `--price 1000 --free-endpoint /a` — paid listing with free endpoints (row 3)
  - `--free --endpoint-price /a=5000` — free listing with paid endpoints (row 4)
- **Skill update**: `pg-sell` SKILL.md documents the four matrix rows + new flag.

> Per-listing logo upload is a web-UX feature only (drag/drop, paste-with-rehost,
> dimension validation in the wizard). It is intentionally not exposed via the
> CLI — sellers upload logos through the dashboard.

> Publish manually with `pnpm publish --no-git-checks` (NOT `npm publish` — see
> CLAUDE.md DO list: `npm publish` leaks `workspace:*` into the tarball, breaking
> every downstream `npm install`).

## 0.6.2 — sync pg-buy skill (0.6.1 shipped stale embedded copy)

Build-time bugfix. `scripts/embed-skills.ts` reads from `packages/cli/skills/`
(a tracked copy that drifted from the project-root `/skills/`). The 0.6.1
release shipped the OLD pg-buy SKILL.md text — the new natural-language
triggers and step-4 endpoint-discovery guidance were not in the published
tarball. This release syncs the embedded copy to match the source skill so
`proxygate skills install` deploys the intended content.

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
  in the Price column for Proxygate-procured listings (e.g. Open-Meteo). The
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
