import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, red, dim, formatCurrency } from '../format.js';

/**
 * Register the `proxygate balance` command.
 *
 * Displays the credit balance, total deposited, and total spent
 * for the authenticated wallet.
 */
export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Check your credit balance')
    .action(async () => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.balance();

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Credit Balance'));
        console.log();
        console.log(`  ${green('Balance:')}          ${formatCurrency(result.balance)}`);
        console.log(`  ${dim('Total Deposited:')}  ${formatCurrency(result.total_deposited)}`);
        console.log(`  ${dim('Total Spent:')}      ${formatCurrency(result.total_spent)}`);
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
