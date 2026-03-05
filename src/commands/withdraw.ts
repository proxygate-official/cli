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
 * Register the `proxygate withdraw` command.
 *
 * Initiates a vault withdrawal with cooldown flow.
 * Uses client.vault.withdraw() which handles cooldown polling internally.
 */
export function registerWithdrawCommand(program: Command): void {
  program
    .command('withdraw')
    .description('Withdraw USDC from your vault back to your Solana wallet')
    .option('-a, --amount <lamports>', 'Amount in USDC base units (omit to withdraw all available)')
    .option('--rpc <url>', 'Solana RPC URL (default: devnet)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate withdraw                # Withdraw all available\n' +
        '  $ proxygate withdraw -a 2000000     # Withdraw 2 USDC\n' +
        '  $ proxygate withdraw --rpc https://api.mainnet-beta.solana.com\n\n' +
        'Withdrawals go through a cooldown period to finalize pending settlements.\n' +
        'The CLI handles polling automatically.',
    )
    .action(async (opts: { amount?: string; rpc?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);

        let amount: number | undefined;
        if (opts.amount) {
          amount = parseInt(opts.amount, 10);
          if (isNaN(amount) || amount <= 0) {
            console.error(red('Error: --amount must be a positive integer (USDC base units)'));
            process.exit(1);
          }
        }

        const result = await client.vault.withdraw({
          ...(amount !== undefined ? { amount } : {}),
          ...(opts.rpc ? { rpcUrl: opts.rpc } : {}),
          onProgress: (info) => {
            if (!parentOpts.json) {
              const secs = Math.ceil(info.remainingMs / 1000);
              process.stdout.write(`\x1b[2K\r  ${dim(`Cooldown: ${secs}s remaining...`)}`);
            }
          },
        });
        if (!parentOpts.json) process.stdout.write('\x1b[2K\r'); // clear progress line

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Vault Withdrawal'));
        console.log();
        // SDK withdraw() handles cooldown polling internally and always
        // returns a 'complete' result with tx_signature and amount_withdrawn.
        console.log(`  ${green('Status:')}        Complete`);
        console.log(`  ${green('TX Signature:')}  ${result.tx_signature}`);
        console.log(`  ${green('Withdrawn:')}     ${formatUsdc(result.amount_withdrawn)}`);

      } catch (err) {
        if (err instanceof ProxyGateError) {
          console.error(red(`Error [${err.code}]: ${err.message}`));
          if (err.action) console.error(dim(`Suggestion: ${err.action}`));
          if (err.code === 'skim_flagged') {
            console.error();
            console.error(
              dim(
                'Your wallet has been flagged for vault skim protection.\n' +
                  'All unsettled entries have been forfeited. Contact support.',
              ),
            );
          }
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
