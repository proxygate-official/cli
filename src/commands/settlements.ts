import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import type { SettlementDaily, SettlementSummary } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, red, dim, formatTable } from '../format.js';

function isBuyerSummary(s: SettlementSummary): s is { total_requests: number; total_cost_usdc: number; total_fees_usdc: number } {
  return 'total_cost_usdc' in s;
}

function isBuyerDaily(d: SettlementDaily): d is { date: string; service: string; request_count: number; total_cost_usdc: number; total_fees_usdc: number; net_spend_usdc: number } {
  return 'total_cost_usdc' in d;
}

export function registerSettlementsCommand(program: Command): void {
  program
    .command('settlements')
    .description('View settlement history (buyer spend or seller earnings)')
    .option('-r, --role <role>', 'Role: buyer or seller')
    .option('-s, --service <name>', 'Filter by service')
    .option('--from <date>', 'Start date (YYYY-MM-DD)')
    .option('--to <date>', 'End date (YYYY-MM-DD)')
    .option('-l, --limit <n>', 'Max entries')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate settlements\n' +
        '  $ proxygate settlements --role seller\n' +
        '  $ proxygate settlements --from 2026-03-01 --json',
    )
    .action(async (opts: { role?: string; service?: string; from?: string; to?: string; limit?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.settlements({
          role: opts.role as 'buyer' | 'seller' | undefined,
          service: opts.service,
          from: opts.from,
          to: opts.to,
          limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
        });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold(`Settlement History (${result.role})`));
        console.log(dim(`${result.date_range.from} to ${result.date_range.to}`));
        console.log();

        if (result.daily.length === 0) {
          console.log(dim('No settlement data found.'));
          return;
        }

        if (isBuyerSummary(result.summary)) {
          console.log(`  ${green('Requests:')}   ${result.summary.total_requests}`);
          console.log(`  ${green('Total Cost:')} $${result.summary.total_cost_usdc}`);
          console.log(`  ${dim('Fees:')}        $${result.summary.total_fees_usdc}`);
        } else {
          console.log(`  ${green('Requests:')}    ${result.summary.total_requests}`);
          console.log(`  ${green('Earnings:')}    $${result.summary.total_earnings_usdc}`);
          console.log(`  ${dim('Fees:')}         $${result.summary.total_fees_usdc}`);
        }
        console.log();

        const headers = isBuyerDaily(result.daily[0])
          ? ['Date', 'Service', 'Requests', 'Cost', 'Fees', 'Net']
          : ['Date', 'Service', 'Requests', 'Earnings', 'Fees', 'Payout'];

        const rows = result.daily.map((d) => {
          if (isBuyerDaily(d)) {
            return [d.date, d.service, String(d.request_count), `$${d.total_cost_usdc}`, `$${d.total_fees_usdc}`, `$${d.net_spend_usdc}`];
          }
          const s = d as { date: string; service: string; request_count: number; total_earnings_usdc: number; total_fees_usdc: number; net_payout_usdc: number };
          return [s.date, s.service, String(s.request_count), `$${s.total_earnings_usdc}`, `$${s.total_fees_usdc}`, `$${s.net_payout_usdc}`];
        });

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
