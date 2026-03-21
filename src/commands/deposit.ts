import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import { getClient } from '../helpers.js';
import { bold, green, yellow, red, dim, formatUsdc } from '../format.js';
import { handleError } from '../errors.js';

const CONFIRM_THRESHOLD = 5_000_000; // 5 USDC

/**
 * Register the `proxygate deposit` command.
 *
 * Initiates a vault deposit by sending USDC on-chain and confirming
 * with the gateway. Uses client.vault.deposit() under the hood.
 */
export function registerDepositCommand(program: Command): void {
  program
    .command('deposit')
    .description('Deposit USDC from your Solana wallet into your ProxyGate vault')
    .requiredOption(
      '-a, --amount <lamports>',
      'Amount in USDC base units (1 USDC = 1,000,000 lamports)',
    )
    .option('--rpc <url>', 'Solana RPC URL (default: mainnet)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Show what would happen without sending the transaction')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate deposit -a 5000000     # Deposit 5 USDC\n' +
        '  $ proxygate deposit -a 1000000     # Deposit 1 USDC\n' +
        '  $ proxygate deposit -a 10000000    # Deposit 10 USDC\n\n' +
        'USDC amounts:\n' +
        '  1 USDC     = 1,000,000\n' +
        '  5 USDC     = 5,000,000\n' +
        '  10 USDC    = 10,000,000\n\n' +
        'Prerequisites:\n' +
        '  Your wallet needs a USDC token account (ATA) on Solana mainnet.\n' +
        '  Create one if needed: spl-token create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\n\n' +
        'The vault auto-initializes on your first deposit.',
    )
    .action(async (opts: { amount: string; rpc?: string; yes?: boolean; dryRun?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);

        const amount = parseInt(opts.amount, 10);
        if (isNaN(amount) || amount <= 0) {
          console.error(red('Error: --amount must be a positive integer (USDC base units)'));
          process.exit(1);
        }

        // Confirm large deposits
        if (!opts.yes && amount >= CONFIRM_THRESHOLD) {
          const usdc = (amount / 1_000_000).toFixed(2);
          console.log(yellow(`Depositing $${usdc} USDC. This sends an on-chain transaction.`));
          const rl = createInterface({ input: process.stdin, output: process.stderr });
          const answer = await new Promise<string>((resolve) => rl.question('Confirm? (y/N) ', resolve));
          rl.close();
          if (!answer.toLowerCase().startsWith('y')) {
            console.log(dim('Cancelled.'));
            return;
          }
        }

        if (opts.dryRun) {
          const usdc = (amount / 1_000_000).toFixed(6);
          console.log(bold('Dry run — no transaction sent'));
          console.log();
          console.log(`  ${dim('Amount:')}   ${usdc} USDC (${amount} base units)`);
          console.log(`  ${dim('Gateway:')}  ${client.gatewayUrl}`);
          console.log(`  ${dim('Wallet:')}   ${client.walletAddress}`);
          return;
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
        handleError(err);
      }
    });
}
