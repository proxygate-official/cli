# @proxygate/cli

## 0.12.1

### Patch Changes

- Document that priced-variant forced params are per-endpoint and do not cascade. SDK `EndpointSpec` `query_overrides`/`body_overrides` type comments now note that overrides apply only to their own endpoint (never to or from same-upstream variants), and the pg-sell skill gains a "Priced variants" section.
- Updated dependencies
  - @proxygate/sdk@0.14.1

## 0.12.0

### Minor Changes

- 84d2c1b: feat(sdk,cli): surface the priced-variant `label` on EndpointSpec and in `proxygate apis`. The seller-internal `upstream_path` alias is intentionally kept out of buyer-facing SDK types.

### Patch Changes

- 5f9a95d: chore(deps): bump all dependencies to latest (graphql 16->17, TypeScript 5->6, eslint 10, next 16.2.9), adapt graphql-parser to graphql-js v17 default-value API, and pin transitive security advisories (ws, postcss, js-yaml) in both override sets.
- Updated dependencies [5f9a95d]
- Updated dependencies [84d2c1b]
  - @proxygate/sdk@0.14.0

## 0.11.0

### Minor Changes

- 4d1961c: `proxygate deposit` is now gasless-first: it tries the x402 top-up rail (Proxygate covers the network fee, so buyers need zero SOL) and falls back to the classic self-paid deposit only when the rail is off (gateway 503). Adds a `--legacy` flag to force the self-paid path. Onboarding and `--rpc` help text updated for the mainnet-beta default and the gasless flow.
- e737c8d: `proxygate proxy` now prints a clear, stack-trace-free message when a call is blocked by a spend limit, distinguishing the daily from the per-transaction window and pointing to Wallets > Limits in the Proxygate web app. Classification uses the SDK so the wording stays in sync with the gateway error codes.
- e737c8d: New `proxygate limits` command. `proxygate limits get` prints the wallet's current daily and per-transaction spend limits in USDC; `proxygate limits set --daily <usdc> --per-tx <usdc>` updates them (pass `none` to clear a limit). USDC is converted to and from micro-USDC, an unspecified flag leaves that limit untouched, and a key lacking the `wallet:limits` scope gets a clear message pointing to the Proxygate web app.

### Patch Changes

- Fix `proxygate create` failing with ENOENT (affected 0.10.1): the bundled CLI (dist/index.js) resolved the templates directory one level too high (packages/templates instead of the package's own templates/), so scaffolding never found a template. It now probes both candidate layouts and uses whichever exists.
- c6c5d1a: Fix `init --gateway <url>` being silently ignored: the subcommand carried a hardcoded prod default that always won, so username/email registration went to prod regardless of the flag. Gateway now resolves with the standard precedence (subcommand flag, global flag, saved config, prod default). Also: markdown docs no longer crash through the OpenAPI parser when `--endpoint` is passed (clear message instead), `--search` now filters markdown docs line-wise instead of being ignored, and user-facing copy no longer uses em-dashes.
- Updated dependencies [d3cd7e5]
- Updated dependencies [4d1961c]
- Updated dependencies [e737c8d]
- Updated dependencies [e737c8d]
- Updated dependencies [4d1961c]
  - @proxygate/sdk@0.13.0

## 0.10.1

### Patch Changes

- Fix the published package crashing on `proxy`, `listings`, and `metadata`.

  The esbuild bundle left ALL bare imports external (`packages: 'external'`),
  including the private workspace packages (`@proxygate/api-types`,
  `@proxygate/openapi-parser`, `@proxygate/graphql-parser`) that never reach
  npm. The workspace symlink resolved them in every local gate, but the
  installed tarball crashed with `ERR_MODULE_NOT_FOUND` on exactly those lazy
  chunks (0.10.0).

  - externals are now derived from `package.json` dependencies, so private
    workspace packages are always bundled in
  - a `createRequire` banner restores `require()` for bundled CJS dependencies
  - `metadata` resolves the package version in both source and bundle layouts
  - `dist/` is cleaned before each build so stale chunks cannot ship
  - new tarball smoke test (CI + `scripts/smoke-tarball.sh`) installs the packed
    artifact outside the workspace and loads every lazy chunk
  - @proxygate/sdk@0.12.0

## 0.10.0

### Minor Changes

- 4bc2750: The skill command reference is now generated from the CLI definitions, so it
  cannot drift from the actual commands.

  `references/commands.md` in every skill is auto-generated from the live Commander
  program (`pnpm --filter @proxygate/cli gen:command-ref`) - a recursive walk that
  emits every command, positional argument, and flag, including deeply-nested
  subcommands like `listings docs --operation/--type/--endpoint`. A vitest gate
  (`command-ref.test.ts`) regenerates and fails if any committed reference is stale,
  naming the file and the fix command, so a new flag can never ship undocumented.

  This replaces three hand-maintained, already-drifted copies of the reference. The
  runtime lazy-load path in `index.ts` is unchanged (the generator builds its own
  program); only the five global options were extracted into `global-options.ts`,
  shared by the runtime and the generator. The narrative guidance and worked
  examples in each `SKILL.md` stay hand-written - this gate enforces the flag
  reference, not the prose.

  Follow-ups (named, not done): the hand-maintained `commands-meta.ts` and the
  `skills/` vs `packages/cli/skills/` tree duplication are separate drift surfaces;
  a few CLI `.description()` strings still use em-dashes (fix at the source and the
  manual picks it up automatically).

- 0bfc21c: Support GraphQL schemas as listing documentation (discovery + display).

  Sellers can now upload a GraphQL schema as a third `doc_type` alongside `openapi`
  and `markdown`. Because GraphQL is self-describing, the counterpart to an OpenAPI
  spec is the schema itself: either SDL (`.graphql`/`.gql`) or the JSON result of an
  introspection query (`{ __schema }` or `{ data: { __schema } }`). A new internal
  package `@proxygate/graphql-parser` normalizes both inputs into the query'able
  operations (Query/Mutation/Subscription root fields with their arguments, return
  types, and deprecation), stored in `listing_docs.parsed_endpoints`.

  Additive across the published contracts:

  - **api-types**: `doc_type` enum widened to `['openapi', 'markdown', 'graphql']`
    in the docs-upload request, docs-upload response, and `ListingDocsResponse`.
  - **sdk**: `UploadDocsOptions`, `UploadDocsResponse`, and `ListingDocsResponse`
    accept the `graphql` doc type; `parsed_endpoints` carries GraphQL operations for
    GraphQL docs.
  - **cli**: `listings upload-docs` / `listings create --docs` auto-detect
    `.graphql`/`.gql` (or `--type graphql` for an introspection `.json`),
    `listings docs <id>` renders a GraphQL operations table (Type / Operation /
    Args / Returns), and `proxygate proxy <listing> /graphql ...` warns (stderr)
    when a GraphQL call returns `{errors}` at HTTP 200 (the call is still billed,
    same as REST).
  - **api-types**: new `GRAPHQL_PROXY_PATH` constant (`'/graphql'`), single-sourcing
    the one HTTP path a GraphQL listing exposes across gateway, cli, and web.

  GraphQL listings are callable end-to-end: on upload the gateway synthesizes a
  single `{ method: 'POST', path: '/graphql' }` endpoint (so the listing surfaces
  in `/v1/apis`, the 404-hint, and MCP), adds `/graphql` to `allowed_paths`, and
  validates it with a GraphQL-aware probe (a `{ __typename }` query whose response
  body must carry `data`, not just HTTP 200). Pricing is flat per-request. Web
  upload UI and marketplace operations viewer support the `graphql` doc type.

  Token-efficient docs drill-down (REST and GraphQL). `listings docs <id>` now
  prints a compact, filterable index (`--search`, `--limit`); agents drill into a
  single unit on demand instead of dumping the whole spec into context:

  - **GraphQL**: `--operation <name>` (signature + return-type fields, one level)
    and `--type <Name>` (any type's fields, one level).
  - **REST**: `--endpoint "POST /path"` (params + request/response body with
    `$ref`s resolved one level).
  - `--raw` emits the full schema (GraphQL normalised to compact SDL, far smaller
    than introspection JSON) and `-o <file>` writes it to disk so it never floods
    the agent's context. On a large schema (~56 ops) the index is ~1k tokens and a
    single-unit detail ~1k tokens, versus ~108k tokens for raw introspection JSON.

  Per-operation pricing and live introspection-over-the-wire are deferred,
  feature-flagged follow-ups.

### Patch Changes

- Updated dependencies [8a37129]
- Updated dependencies [0bfc21c]
  - @proxygate/sdk@0.12.0
