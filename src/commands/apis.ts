import type { Command } from 'commander';
import { getClient } from '../helpers.js';
import { bold, dim, cyan, formatTable, formatWallet } from '../format.js';
import { handleError } from '../errors.js';

export function registerApisCommand(program: Command): void {
  program
    .command('apis')
    .alias('search')
    .description('Browse and search available API listings (no auth required)')
    .argument('[search]', 'Search term (shorthand for -q)')
    .option('-q, --query <text>', 'Search by name or description')
    .option('-s, --service <slug>', 'Filter by exact service slug')
    .option('-c, --category <slug>', 'Filter by category slug')
    .option('--sort <order>', 'Sort: price_asc, price_desc, popular, newest')
    .option('-l, --limit <n>', 'Max results', '20')
    .option('--cursor <id>', 'Pagination cursor (listing ID from previous page)')
    .option('--verified', 'Show only verified sellers')
    .option('--compact', 'Minimal output: id, name, price only (good for agents)')
    .option('-t, --type <type>', 'Filter by listing type (skill, product, dataset, service, connector)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate apis -q "postal lookup"    # Search by name\n' +
        '  $ proxygate apis -q geocoding          # Fuzzy search\n' +
        '  $ proxygate apis --service openai --sort price_asc\n' +
        '  $ proxygate apis --verified --json     # Verified only, JSON output\n' +
        '  $ proxygate apis -q weather --compact  # Minimal output for agents\n' +
        '  $ proxygate apis --cursor <id> -l 10   # Next page\n' +
        '  $ proxygate search weather             # Alias for apis -q',
    )
    .action(async (search: string | undefined, opts: { service?: string; category?: string; sort?: string; query?: string; limit: string; cursor?: string; verified?: boolean; compact?: boolean; type?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      const queryText = opts.query ?? search;

      try {
        const client = await getClient(parentOpts);
        const result = await client.apis({
          service: opts.service,
          category: opts.category,
          sort: opts.sort as 'price_asc' | 'price_desc' | 'popular' | 'newest' | undefined,
          q: queryText,
          limit: parseInt(opts.limit, 10),
          cursor: opts.cursor,
          verified: opts.verified || undefined,
          type: opts.type as import('@proxygate/sdk').ListingType | undefined,
        });

        if (parentOpts.json && opts.compact) {
          const compact = {
            data: result.data.map((l) => ({
              id: l.listing_id,
              name: l.service_name,
              service: l.service,
              type: l.listing_type ?? 'proxy',
              price: l.price_per_request_usdc != null ? `$${l.price_per_request_usdc}/req` : 'per-token',
            })),
            has_more: result.has_more,
            cursor: result.cursor,
          };
          console.log(JSON.stringify(compact, null, 2));
          return;
        }

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.data.length === 0) {
          console.log(dim('No listings found.'));
          return;
        }

        console.log(bold(`API Listings (${result.data.length})`));
        console.log();

        if (opts.compact) {
          const headers = ['ID', 'Service', 'Price'];
          const rows = result.data.map((l) => [
            l.listing_id,
            l.service_name,
            l.price_per_request_usdc != null ? `$${l.price_per_request_usdc}/req` : 'per-token',
          ]);
          console.log(formatTable(headers, rows));
        } else {
          // Phase 51-09: prefer slug-based identifiers over raw UUIDs
          // Listing column shows `seller_slug/slug` composite when available,
          // falls back to first 8 chars of UUID for legacy listings.
          // Seller column prefers organization > display_name > truncated wallet.
          const headers = ['Listing', 'Service', 'Type', 'Seller', 'Price', 'RPM', 'Uptime', 'Trust', 'Verified'];
          const rows = result.data.map((l) => {
            const sellerSlug = l.seller_slug;
            const listingSlug = l.slug;
            const listingCol = sellerSlug && listingSlug
              ? `${sellerSlug}/${listingSlug}`
              : listingSlug ?? l.listing_id.slice(0, 8);
            const sellerCol = l.organization ?? formatWallet(l.seller_wallet);
            return [
              listingCol,
              `${bold(cyan(l.service_name))} ${dim(`(${l.service})`)}`,
              l.listing_type ?? 'api',
              sellerCol,
              l.price_per_request_usdc != null ? `$${l.price_per_request_usdc}/req` : 'per-token',
              String(l.available_rpm),
              `${l.uptime_percent.toFixed(1)}%`,
              l.trust_score.toFixed(2),
              l.is_verified ? bold(cyan('yes')) : dim('no'),
            ];
          });
          console.log(formatTable(headers, rows));

          // Show endpoints when viewing a single listing or small result set
          if (result.data.length <= 3) {
            for (const l of result.data) {
              if (l.endpoints && l.endpoints.length > 0) {
                console.log();
                console.log(bold(`Endpoints for ${l.service_name}:`));
                const defaultPrice = l.price_per_request_usdc != null ? `$${l.price_per_request_usdc}/req` : 'per-token';
                const epPrices = (l.endpoint_prices ?? []) as Array<{ path: string; pricing_unit: string; price_per_request?: number; price_per_input_token?: number; price_per_output_token?: number }>;
                const epHeaders = ['Method', 'Path', 'Description', 'Price'];
                const epRows = (l.endpoints as Array<{ method?: string; path?: string; description?: string }>).map((ep) => {
                  const match = epPrices.find((p) => p.path === ep.path);
                  let price = defaultPrice;
                  if (match) {
                    if (match.pricing_unit === 'per_token') {
                      const inp = match.price_per_input_token ? (match.price_per_input_token / 1_000_000).toFixed(6) : '0';
                      const out = match.price_per_output_token ? (match.price_per_output_token / 1_000_000).toFixed(6) : '0';
                      price = `$${inp}/$${out}/tok`;
                    } else if (match.price_per_request) {
                      price = `$${(match.price_per_request / 1_000_000).toFixed(4)}/req`;
                    }
                  }
                  return [ep.method ?? '', ep.path ?? '', ep.description ?? '', price];
                });
                console.log(formatTable(epHeaders, epRows));

                // Show body overrides
                const eps = l.endpoints as Array<{ path?: string; body_overrides?: Record<string, unknown>; query_overrides?: Record<string, string> }>;
                const epsWithBodyOverrides = eps.filter((ep) => ep.body_overrides && Object.keys(ep.body_overrides).length > 0);
                const epsWithQueryOverrides = eps.filter((ep) => ep.query_overrides && Object.keys(ep.query_overrides).length > 0);
                if (epsWithBodyOverrides.length > 0) {
                  console.log(dim('  Body overrides (fields forced by seller — you cannot change these):'));
                  for (const ep of epsWithBodyOverrides) {
                    console.log(dim(`    ${ep.path}: ${JSON.stringify(ep.body_overrides)}`));
                  }
                }
                if (epsWithQueryOverrides.length > 0) {
                  console.log(dim('  Query param overrides (forced by seller):'));
                  for (const ep of epsWithQueryOverrides) {
                    console.log(dim(`    ${ep.path}: ${JSON.stringify(ep.query_overrides)}`));
                  }
                }
              }
            }
          }
        }

        if (result.has_more) {
          console.log();
          console.log(dim(`More available — next page: --cursor ${result.cursor}`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
