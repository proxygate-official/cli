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
    .option('--verified', 'Show only verified sellers')
    .option('-t, --type <type>', 'Filter by listing type (skill, product, dataset, service, connector)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate apis -q "postal lookup"    # Search by name\n' +
        '  $ proxygate apis -q geocoding          # Fuzzy search\n' +
        '  $ proxygate apis --service openai --sort price_asc\n' +
        '  $ proxygate apis --verified --json     # Verified only, JSON output\n' +
        '  $ proxygate search weather             # Alias for apis -q',
    )
    .action(async (search: string | undefined, opts: { service?: string; category?: string; sort?: string; query?: string; limit: string; verified?: boolean; type?: string }) => {
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
          verified: opts.verified || undefined,
          type: opts.type as import('@proxygate/sdk').ListingType | undefined,
        });

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

        const headers = ['ID', 'Service', 'Type', 'Seller', 'Price', 'RPM', 'Uptime', 'Trust', 'Verified'];
        const rows = result.data.map((l) => [
          l.listing_id.slice(0, 8),
          `${bold(cyan(l.service_name))} ${dim(`(${l.service})`)}`,
          l.listing_type ?? 'api',
          formatWallet(l.seller_wallet),
          l.price_per_request_usdc != null ? `$${l.price_per_request_usdc}/req` : 'per-token',
          String(l.available_rpm),
          `${l.uptime_percent.toFixed(1)}%`,
          l.trust_score.toFixed(2),
          l.is_verified ? bold(cyan('yes')) : dim('no'),
        ]);

        console.log(formatTable(headers, rows));

        if (result.has_more) {
          console.log();
          console.log(dim(`Showing ${result.data.length} results. More available — use -l <n> to increase or --json for cursor pagination.`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
