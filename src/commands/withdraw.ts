import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, red, dim, formatCurrency } from '../format.js';

/**
 * Register the `proxygate withdraw` command.
 *
 * Converts credits back to USDC and sends to the wallet.
 */
export function registerWithdrawCommand(program: Command): void {
  program
    .command('withdraw')
    .description('Withdraw credits to USDC')
    .requiredOption('-a, --amount <micro-cents>', 'Amount to withdraw in micro-cents')
    .action(async (opts: { amount: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);

        const amount = parseInt(opts.amount, 10);
        if (isNaN(amount) || amount <= 0) {
          console.error(red('Error: --amount must be a positive integer (micro-cents)'));
          process.exit(1);
        }

        const result = await client.withdraw({ amount });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Withdrawal Successful'));
        console.log();
        console.log(`  ${green('Withdrawn:')}       ${formatCurrency(result.amount_withdrawn)}`);
        console.log(`  ${green('USDC Sent:')}       ${result.usdc_withdrawn}`);
        console.log(`  ${dim('Remaining:')}       ${formatCurrency(result.remaining_balance)}`);
        console.log(`  ${dim('TX Signature:')}    ${result.tx_signature}`);
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
