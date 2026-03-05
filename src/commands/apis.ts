import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, red, dim, cyan, formatTable, formatWallet } from '../format.js';

export function registerApisCommand(program: Command): void {
  program
    .command('apis')
    .description('Browse available API listings with filters (no auth required)')
    .option('-s, --service <name>', 'Filter by service')
    .option('-c, --category <slug>', 'Filter by category')
    .option('--sort <order>', 'Sort: price_asc, price_desc, popular, newest')
    .option('-q, --query <text>', 'Text search')
    .option('-l, --limit <n>', 'Max results', '20')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate apis\n' +
        '  $ proxygate apis --service openai --sort price_asc\n' +
        '  $ proxygate apis --category llm --json',
    )
    .action(async (opts: { service?: string; category?: string; sort?: string; query?: string; limit: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.apis({
          service: opts.service,
          category: opts.category,
          sort: opts.sort as 'price_asc' | 'price_desc' | 'popular' | 'newest' | undefined,
          q: opts.query,
          limit: parseInt(opts.limit, 10),
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

        const headers = ['ID', 'Service', 'Seller', 'Price', 'RPM', 'Uptime', 'Trust'];
        const rows = result.data.map((l) => [
          l.listing_id.slice(0, 8),
          `${bold(cyan(l.service_name))} ${dim(`(${l.service})`)}`,
          formatWallet(l.seller_wallet),
          l.price_per_request_usdc != null ? `$${l.price_per_request_usdc}/req` : 'per-token',
          String(l.available_rpm),
          `${l.uptime_percent.toFixed(1)}%`,
          l.trust_score.toFixed(2),
        ]);

        console.log(formatTable(headers, rows));

        if (result.has_more) {
          console.log();
          console.log(dim('More results available. Use --limit or --json for pagination.'));
        }
      } catch (err) {
        if (err instanceof ProxyGateError) {
          console.error(red(`Error [${err.code}]: ${err.message}`));
          if (err.action) console.error(dim(`Suggestion: ${err.action}`));
          process.exit(1);
        }
        throw err;
      }
    });
}
