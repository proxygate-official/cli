import type { Command } from 'commander';
import type { PricingServiceEntry } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import {
  bold,
  dim,
  cyan,
  formatTable,
} from '../format.js';
import { handleError } from '../errors.js';

/**
 * Format a service entry's price for display.
 * Per-token pricing shows input/output USDC rates; per-request shows flat price.
 */
function formatPrice(svc: PricingServiceEntry): string {
  if (svc.pricing_unit === 'per_token' || svc.pricing_unit === 'both') {
    const input = svc.price_per_input_token_usdc ?? 0;
    const output = svc.price_per_output_token_usdc ?? 0;
    return `$${input}/$${output} per token`;
  }
  return `$${svc.price_per_request_usdc} per req`;
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
    .description('Browse available APIs, sellers, and pricing (no auth required)')
    .option('-s, --service <name>', 'Filter by service name (e.g., openai, anthropic)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate pricing\n' +
        '  $ proxygate pricing --service openai\n' +
        '  $ proxygate pricing --json          # Get listing IDs for proxy command',
    )
    .action(async (opts: { service?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        console.error(dim('Note: `pricing` is deprecated. Use `proxygate apis` instead.'));
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

        const headers = ['Service', 'Type', 'Price', 'Sellers', 'Available RPM'];
        const rows = result.services.map((svc) => [
          `${bold(cyan(svc.name))} ${dim(`(${svc.service})`)}`,
          svc.pricing_unit,
          formatPrice(svc),
          String(svc.sellers),
          String(svc.available_rpm),
        ]);

        console.log(formatTable(headers, rows));
        console.log();
        console.log(dim(`Last updated: ${result.last_updated}`));
      } catch (err) {
        handleError(err);
      }
    });
}
