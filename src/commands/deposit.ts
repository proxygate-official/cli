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
 * Register the `proxygate deposit` command.
 *
 * Initiates a vault deposit by sending USDC on-chain and confirming
 * with the gateway. Uses client.vault.deposit() under the hood.
 */
export function registerDepositCommand(program: Command): void {
  program
    .command('deposit')
    .description('Deposit USDC into your vault')
    .requiredOption('-a, --amount <lamports>', 'Amount to deposit in USDC base units (1 USDC = 1000000)')
    .option('--rpc <url>', 'Solana RPC URL override')
    .action(async (opts: { amount: string; rpc?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);

        const amount = parseInt(opts.amount, 10);
        if (isNaN(amount) || amount <= 0) {
          console.error(red('Error: --amount must be a positive integer (USDC base units)'));
          process.exit(1);
        }

        const result = await client.vault.deposit({
          amount,
          ...(opts.rpc ? { rpcUrl: opts.rpc } : {}),
        });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(bold('Vault Deposit'));
        console.log();
        console.log(`  ${green('TX Signature:')}  ${result.tx_signature}`);
        console.log(`  ${green('Deposited:')}     ${formatUsdc(result.deposited)}`);
        console.log(`  ${green('New Balance:')}   ${formatUsdc(result.balance)} (vault)`);
      } catch (err) {
        if (err instanceof ProxyGateError) {
          console.error(red(`Error [${err.code}]: ${err.message}`));
          if (err.action) console.error(dim(`Suggestion: ${err.action}`));
          if (err.code === 'vault_not_found' || err.code === 'deposit_not_found') {
            console.error();
            console.error(
              dim(
                'Ensure you have USDC in your wallet and have sent a deposit TX on-chain.\n' +
                  'The vault must be initialized before confirming a deposit.',
              ),
            );
          }
          process.exit(1);
        }
        if (err instanceof Error) {
          console.error(red(`Error: ${err.message}`));
          console.error(dim('Ensure you have sufficient USDC in your wallet for the deposit.'));
          process.exit(1);
        }
        throw err;
      }
    });
}
