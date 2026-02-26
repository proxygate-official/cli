import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import type { PricingListing } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import {
  bold,
  red,
  dim,
  cyan,
  formatTable,
  formatCurrency,
  formatWallet,
} from '../format.js';

/**
 * Format a listing's price for display.
 * Per-token pricing shows input/output rates; per-request shows flat price.
 */
function formatPrice(listing: PricingListing): string {
  if (listing.pricing_model === 'per_token') {
    const input = listing.input_price_per_token ?? 0;
    const output = listing.output_price_per_token ?? 0;
    return `${formatCurrency(input)}/${formatCurrency(output)} per token`;
  }
  return `${formatCurrency(listing.price_per_request ?? 0)} per req`;
}

/**
 * Register the `proxygate pricing` command.
 *
 * Displays available API pricing in a formatted table,
 * optionally filtered by service name.
 */
export function registerPricingCommand(program: Command): void {
  program
    .command('pricing')
    .description('View available API pricing')
    .option('-s, --service <name>', 'Filter by service name')
    .action(async (opts: { service?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.pricing({ service: opts.service });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.services.length === 0) {
          console.log(dim('No services found.'));
          return;
        }

        for (const svc of result.services) {
          console.log(bold(cyan(svc.service)));

          const headers = ['Seller', 'Model', 'Price', 'Uptime', 'Latency'];
          const rows = svc.listings.map((l) => [
            formatWallet(l.seller_id),
            l.pricing_model,
            formatPrice(l),
            l.uptime_pct !== undefined ? `${l.uptime_pct.toFixed(1)}%` : '-',
            l.latency_ms !== undefined ? `${l.latency_ms}ms` : '-',
          ]);

          console.log(formatTable(headers, rows));
          console.log();
        }

        console.log(dim(`Last updated: ${result.last_updated}`));
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
