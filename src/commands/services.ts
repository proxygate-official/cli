import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, red, dim, cyan, formatTable, formatWallet } from '../format.js';

export function registerServicesCommand(program: Command): void {
  program
    .command('services')
    .description('View aggregated service stats (no auth required)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate services\n' +
        '  $ proxygate services --json',
    )
    .action(async () => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.services();

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.services.length === 0) {
          console.log(dim('No services available.'));
          return;
        }

        console.log(bold(`Services (${result.count})`));
        console.log();

        const headers = ['Service', 'Cheapest', 'Avg Latency', 'Sellers', 'RPM', 'Rating'];
        const rows = result.services.map((s) => [
          `${bold(cyan(s.service_name))} ${dim(`(${s.service})`)}`,
          `$${s.cheapest_price_usdc}`,
          `${s.avg_latency_ms}ms`,
          String(s.active_seller_count),
          String(s.total_capacity_rpm),
          s.avg_rating > 0 ? s.avg_rating.toFixed(1) : dim('n/a'),
        ]);

        console.log(formatTable(headers, rows));
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
