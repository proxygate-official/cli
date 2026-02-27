import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, yellow, red, dim } from '../format.js';

/**
 * Format a USDC amount from lamports (base units, 6 decimals).
 */
function formatUsdc(lamports: number): string {
  return `${(lamports / 1_000_000).toFixed(6)} USDC`;
}

/**
 * Register the `proxygate balance` command.
 *
 * Displays the vault balance breakdown: total, pending settlement,
 * available, and cooldown status.
 */
export function registerBalanceCommand(program: Command): void {
  program
    .command('balance')
    .description('Check your vault balance')
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
