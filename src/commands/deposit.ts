import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, yellow, red, dim, formatCurrency } from '../format.js';

/**
 * Register the `proxygate deposit` command.
 *
 * Initiates a credit deposit via x402 payment flow.
 * This is a simplified CLI flow; for full x402 control,
 * use the SDK directly.
 */
export function registerDepositCommand(program: Command): void {
  program
    .command('deposit')
    .description('Deposit credits via x402 payment')
    .action(async () => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);

        if (!parentOpts.json) {
          console.log(
            yellow(
              'Note: Deposit requires x402 payment. This is a simplified CLI flow.',
            ),
          );
          console.log();
        }

        const result = await client.deposit();

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Deposit Successful'));
        console.log();
        console.log(`  ${green('Deposited:')}    ${formatCurrency(result.deposited)}`);
        console.log(`  ${green('New Balance:')}  ${formatCurrency(result.balance)}`);
      } catch (err) {
        if (err instanceof ProxyGateError) {
          console.error(red(`Error [${err.code}]: ${err.message}`));
          if (err.action) console.error(dim(`Suggestion: ${err.action}`));
          if (err.code === 'deposits_disabled' || err.code === 'payment_required') {
            console.error();
            console.error(
              dim(
                'For full x402 payment flow, use the SDK directly:\n' +
                  '  import { ProxyGateClient } from "@proxygate/sdk";\n' +
                  '  await client.deposit(paymentHeaders);',
              ),
            );
          }
          process.exit(1);
        }
        throw err;
      }
    });
}
