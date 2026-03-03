import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, red, dim } from '../format.js';

/**
 * Format a USDC amount from lamports (base units, 6 decimals).
 */
function formatUsdc(lamports: number): string {
  return `${(lamports / 1_000_000).toFixed(6)} USDC`;
}

/**
 * Register the `proxygate withdraw-confirm` command.
 *
 * Confirms a completed on-chain withdrawal with the gateway.
 * Used for recovery when the SDK crashed after the on-chain TX
 * but before the gateway was notified.
 */
export function registerWithdrawConfirmCommand(program: Command): void {
  program
    .command('withdraw-confirm')
    .description('Confirm an on-chain withdrawal with the gateway (recovery tool)')
    .requiredOption('--tx <signature>', 'Solana transaction signature to confirm')
    .addHelpText(
      'after',
      '\nWhen to use this:\n' +
        '  If `proxygate withdraw` crashed after the on-chain TX succeeded but\n' +
        '  before the gateway was notified, use this to complete the process.\n\n' +
        'Example:\n' +
        '  $ proxygate withdraw-confirm --tx 5UyT3...abc',
    )
    .action(async (opts: { tx: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.vault.withdrawConfirm(opts.tx);

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Withdrawal Confirmed'));
        console.log();
        console.log(`  ${green('Withdrawn:')}  ${formatUsdc(result.withdrawn)}`);
        console.log(`  ${green('Balance:')}    ${formatUsdc(result.balance)}`);
        console.log(`  ${green('TX:')}         ${result.tx_signature}`);
      } catch (err) {
        if (err instanceof ProxyGateError) {
          console.error(red(`Error [${err.code}]: ${err.message}`));
          if (err.action) console.error(dim(`Suggestion: ${err.action}`));
          process.exit(1);
        }
        if (err instanceof Error) {
          console.error(red(`Error: ${err.message}`));
          process.exit(1);
        }
        throw err;
      }
    });
}
