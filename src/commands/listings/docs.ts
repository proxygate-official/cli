import { writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { graphqlToSDL, describeGraphQLOperation, describeGraphQLType, parseGraphQLSchema, type ParsedOperation } from '@proxygate/graphql-parser';
import { describeEndpoint } from '@proxygate/openapi-parser';
import { getClient } from '../../helpers.js';
import { bold, dim, red, formatTable } from '../../format.js';
import { truncate, handleError } from './helpers.js';
import { renderGraphQLIndex, renderGraphQLOperation, renderGraphQLType, renderEndpoint } from './docs-render.js';

interface DocsOpts {
  raw?: boolean; output?: string; operation?: string; type?: string;
  endpoint?: string; search?: string; limit?: string;
}

/** Format endpoint price for the REST index, falling back to the listing default. */
function formatEndpointPrice(
  ep: { path?: string },
  prices: Array<{ path: string; pricing_unit: string; price_per_request?: number; price_per_input_token?: number; price_per_output_token?: number }> | undefined,
  fallback: string,
): string {
  const match = prices?.find((p) => p.path === ep.path);
  if (!match) return fallback;
  if (match.pricing_unit === 'per_token') {
    const i = match.price_per_input_token ? (match.price_per_input_token / 1e6).toFixed(6) : '0';
    const o = match.price_per_output_token ? (match.price_per_output_token / 1e6).toFixed(6) : '0';
    return `$${i}/$${o}/tok`;
  }
  return match.price_per_request ? `$${(match.price_per_request / 1e6).toFixed(4)}/req` : fallback;
}

/** Filter rows by a search term and cap to a limit; returns the capped rows plus a "showing N of M" note. */
function applyFilter<T>(rows: T[], toText: (r: T) => string, search?: string, limitStr?: string): { rows: T[]; note: string } {
  const filtered = search ? rows.filter((r) => toText(r).toLowerCase().includes(search.toLowerCase())) : rows;
  const limit = limitStr ? Number.parseInt(limitStr, 10) : 40;
  const capped = limit > 0 ? filtered.slice(0, limit) : filtered;
  const note = capped.length < filtered.length
    ? dim(`\nShowing ${capped.length} of ${filtered.length}. Narrow with --search <term> or raise --limit.`)
    : '';
  return { rows: capped, note };
}

/** --raw: emit the full schema (GraphQL normalised to compact SDL) to a file or stdout. */
async function emitRaw(content: string, docType: string, output?: string): Promise<void> {
  let body = content;
  if (docType === 'graphql') {
    const sdl = graphqlToSDL(content);
    if (sdl.success) body = sdl.sdl; // compact SDL << verbose introspection JSON
  }
  if (output) {
    await writeFile(output, body, 'utf-8');
    console.log(dim(`Wrote ${docType} schema to ${output} (${body.length} bytes). Inspect it locally with grep/less.`));
  } else {
    console.log(body);
  }
}

/** Register the `listings docs` subcommand. */
export function registerDocsSubcommand(listings: Command, program: Command): void {
  listings
    .command('docs <id>')
    .description('API docs: compact index by default; drill into one unit (--operation/--type/--endpoint); --raw for the full schema')
    .option('--raw', 'Full spec/schema (GraphQL as compact SDL). Large - prefer -o to a file.')
    .option('-o, --output <file>', 'Write --raw to a file instead of stdout (keeps it out of your context)')
    .option('--operation <name>', 'GraphQL: one operation + its return type fields (one level)')
    .option('--type <name>', 'GraphQL: one type\'s fields (one level)')
    .option('--endpoint <path>', 'REST: one endpoint\'s params + body schema. Accepts "/path" (GET) or "POST /path".')
    .option('--search <term>', 'Filter the index by name/path')
    .option('--limit <n>', 'Max index rows (default 40)')
    .action(async (id: string, opts: DocsOpts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const docs = await client.docs(id);
        if (!docs) { console.log(dim('No documentation found for this listing.')); return; }

        if (opts.raw) { await emitRaw(docs.content, docs.doc_type, opts.output); return; }

        // --- Targeted detail (cheap: only the one unit you ask for) ---
        if (docs.doc_type === 'graphql' && (opts.operation || opts.type)) {
          const res = opts.operation
            ? describeGraphQLOperation(docs.content, opts.operation)
            : describeGraphQLType(docs.content, opts.type as string);
          if (!res.success) { console.error(red(res.error)); process.exit(1); }
          console.log('description' in res ? renderGraphQLOperation(res.description) : renderGraphQLType(res.type));
          return;
        }
        if (docs.doc_type !== 'graphql' && opts.endpoint) {
          const [maybeMethod, maybePath] = opts.endpoint.includes(' ') ? opts.endpoint.split(/\s+/, 2) : ['GET', opts.endpoint];
          const res = describeEndpoint(docs.content, maybeMethod, maybePath);
          if (!res.success) { console.error(red(res.error + (res.availableMethods ? ` (available: ${res.availableMethods.join(', ')})` : ''))); process.exit(1); }
          console.log(renderEndpoint(res.endpoint));
          return;
        }

        // --- Default: compact, filterable index ---
        console.log(bold(`Documentation (${docs.doc_type})`));
        console.log(dim(`Listing: ${docs.listing_id}  Updated: ${docs.updated_at}`));
        console.log();

        if (docs.doc_type === 'graphql') {
          const stored = docs.parsed_endpoints;
          let all: ParsedOperation[];
          if (Array.isArray(stored) && stored.length > 0) {
            all = stored as unknown as ParsedOperation[];
          } else {
            const parsed = await parseGraphQLSchema(docs.content);
            all = parsed.success ? parsed.operations : [];
          }
          const { rows, note } = applyFilter(all, (o) => `${o.operationType} ${o.name}`, opts.search, opts.limit);
          console.log(renderGraphQLIndex(rows));
          if (note) console.log(note);
          console.log(dim('\nDrill in: listings docs <id> --operation <name>  |  --type <Name>  |  --raw -o schema.graphql'));
          return;
        }
        if (docs.doc_type === 'markdown' || !docs.parsed_endpoints) { console.log(docs.content); return; }

        const listing = await client.apis({ service: undefined, q: undefined, limit: 100 }).then((r) => r.data.find((l) => l.listing_id === id)).catch(() => undefined);
        const prices = listing?.endpoint_prices as Parameters<typeof formatEndpointPrice>[1];
        const fallback = listing?.price_per_request_usdc != null ? `$${listing.price_per_request_usdc}/req` : 'per-token';
        const eps = docs.parsed_endpoints as Array<{ method?: string; path?: string; summary?: string }>;
        const { rows, note } = applyFilter(eps, (e) => `${e.method} ${e.path} ${e.summary ?? ''}`, opts.search, opts.limit);
        console.log(formatTable(['Method', 'Path', 'Summary', 'Price'], rows.map((ep) => [
          ep.method ?? '', ep.path ?? '', truncate(ep.summary ?? '', 40), formatEndpointPrice(ep, prices, fallback),
        ])));
        if (note) console.log(note);
        console.log(dim('\nDrill in: listings docs <id> --endpoint "POST /path"  |  --raw -o spec.yaml'));
      } catch (err) {
        handleError(err);
      }
    });
}
