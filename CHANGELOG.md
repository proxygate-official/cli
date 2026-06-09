# @proxygate/cli

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
