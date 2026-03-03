import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import {
  bold,
  red,
  dim,
  cyan,
  formatTable,
  formatCurrency,
} from '../format.js';

/**
 * Register the `proxygate usage` command.
 *
 * Displays usage history with summary per service,
 * followed by a detailed request log table.
 */
export function registerUsageCommand(program: Command): void {
  program
    .command('usage')
    .description('View your API usage history with per-service summaries')
    .option('-s, --service <name>', 'Filter by service (e.g., openai, anthropic)')
    .option('--from <date>', 'Start date (ISO 8601, e.g., 2026-03-01)')
    .option('--to <date>', 'End date (ISO 8601)')
    .option('-l, --limit <n>', 'Number of entries to show (default: 20)', '20')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate usage\n' +
        '  $ proxygate usage --service openai --limit 50\n' +
        '  $ proxygate usage --from 2026-03-01 --to 2026-03-03\n' +
        '  $ proxygate usage --json | jq ".usage[] | {service, cost_micro_cents}"',
    )
    .action(
      async (opts: {
        service?: string;
        from?: string;
        to?: string;
        limit: string;
      }) => {
        const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

        try {
          const client = await getClient(parentOpts);
          const result = await client.usage({
            service: opts.service,
            from: opts.from,
            to: opts.to,
            limit: parseInt(opts.limit, 10),
          });

          if (parentOpts.json) {
            console.log(JSON.stringify(result, null, 2));
            return;
          }

          // Summary per service
          if (result.summary.length > 0) {
            console.log(bold('Usage Summary'));
            console.log();

            for (const s of result.summary) {
              console.log(
                `  ${cyan(s.service)}  ${s.total_requests} requests  ${formatCurrency(s.total_cost)}  avg ${s.avg_latency.toFixed(0)}ms`,
              );
            }
            console.log();
          }

          // Detailed request log
          if (result.usage.length === 0) {
            console.log(dim('No usage entries found.'));
            return;
          }

          console.log(bold('Recent Requests'));
          console.log();

          const headers = ['Time', 'Service', 'Status', 'Latency', 'Cost'];
          const rows = result.usage.map((u) => [
            new Date(u.timestamp).toLocaleString(),
            u.service,
            String(u.status_code),
            `${u.latency_ms}ms`,
            formatCurrency(u.cost_micro_cents),
          ]);

          console.log(formatTable(headers, rows));

          if (result.usage.length >= parseInt(opts.limit, 10)) {
            console.log();
            console.log(dim('Use --limit to see more entries.'));
          }
        } catch (err) {
          if (err instanceof ProxyGateError) {
            console.error(red(`Error [${err.code}]: ${err.message}`));
            if (err.action) console.error(dim(`Suggestion: ${err.action}`));
            process.exit(1);
          }
          throw err;
        }
      },
    );
}
