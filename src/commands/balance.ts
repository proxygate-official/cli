import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, yellow, red, dim, formatUsdc } from '../format.js';

/**
 * Register the `proxygate balance` command.
 *
 * Displays the vault balance breakdown: total, pending settlement,
 * available, and cooldown status.
 */
export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Show your USDC vault balance (total, available, pending, cooldown)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate balance\n' +
        '  $ proxygate balance --json          # Machine-readable output\n' +
        '  $ proxygate balance --json | jq .available',
    )
    .action(async () => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.vault.balance();

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Vault Balance'));
        console.log();
        console.log(`  ${green('Total:')}              ${formatUsdc(result.balance)}`);
        console.log(`  ${dim('Pending Settlement:')} ${formatUsdc(result.pending_settlement)}`);
        console.log(`  ${green('Available:')}          ${formatUsdc(result.available)}`);

        if (result.in_cooldown) {
          console.log(`  ${yellow('Cooldown:')}           Yes`);
        } else {
          console.log(`  ${dim('Cooldown:')}           No`);
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
