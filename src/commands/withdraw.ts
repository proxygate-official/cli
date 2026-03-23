import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import { getClient } from '../helpers.js';
import { loadConfig } from '../config.js';
import { bold, green, yellow, red, dim, formatUsdc } from '../format.js';
import { handleError } from '../errors.js';

const CONFIRM_THRESHOLD = 5_000_000; // 5 USDC

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
    .option('--rpc <url>', 'Solana RPC URL')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Show what would happen without withdrawing')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate withdraw                # Withdraw all available\n' +
        '  $ proxygate withdraw -a 2000000     # Withdraw 2 USDC\n' +
        '  $ proxygate withdraw --rpc https://api.mainnet-beta.solana.com\n\n' +
        'Withdrawals go through a cooldown period to finalize pending settlements.\n' +
        'The CLI handles polling automatically.',
    )
    .action(async (opts: { amount?: string; rpc?: string; yes?: boolean; dryRun?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        // Delegation token without keypair — open browser for TX approval
        const config = await loadConfig();
        if (config?.delegationToken && !config.keypairPath) {
          const { startCallbackServer } = await import('../lib/localhost-server.js');
          const { openBrowser } = await import('../lib/browser.js');

          let withdrawAmount: number | undefined;
          if (opts.amount) {
            withdrawAmount = parseInt(opts.amount, 10);
            if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
              console.error(red('Error: --amount must be a positive integer (USDC base units)'));
              process.exit(1);
            }
          }

          const { port, state, waitForCallback, close } = await startCallbackServer();
          const amountParam = withdrawAmount ? `&amount=${withdrawAmount}` : '';
          const url = `https://app.proxygate.ai/cli-tx?type=withdraw${amountParam}&wallet=${config.wallet ?? ''}&port=${port}&state=${state}`;

          console.log(dim('Opening browser to approve transaction...'));
          openBrowser(url);
          console.log(dim('Waiting for approval... (Ctrl+C to cancel)'));

          try {
            await waitForCallback();
            const label = withdrawAmount ? formatUsdc(withdrawAmount) : 'all available USDC';
            console.log(green(`Withdrawal confirmed: ${label}`));
          } catch {
            console.error(red('Transaction approval timed out or failed.'));
            process.exit(1);
          } finally {
            close();
          }
          return;
        }

        const client = await getClient(parentOpts);

        let amount: number | undefined;
        if (opts.amount) {
          amount = parseInt(opts.amount, 10);
          if (isNaN(amount) || amount <= 0) {
            console.error(red('Error: --amount must be a positive integer (USDC base units)'));
            process.exit(1);
          }
        }

        if (opts.dryRun) {
          const label = amount ? `${(amount / 1_000_000).toFixed(6)} USDC` : 'all available USDC';
          console.log(bold('Dry run — no transaction sent'));
          console.log();
          console.log(`  ${dim('Amount:')}   ${label}`);
          console.log(`  ${dim('Gateway:')}  ${client.gatewayUrl}`);
          console.log(`  ${dim('Wallet:')}   ${client.walletAddress}`);
          console.log(`  ${dim('Note:')}     Includes cooldown period before finalization`);
          return;
        }

        // Confirm large or full withdrawals
        const effectiveAmount = amount ?? 0;
        if (!opts.yes && (effectiveAmount >= CONFIRM_THRESHOLD || !amount)) {
          const label = amount ? `$${(amount / 1_000_000).toFixed(2)} USDC` : 'all available USDC';
          console.log(yellow(`Withdrawing ${label}. This includes a cooldown period.`));
          const rl = createInterface({ input: process.stdin, output: process.stderr });
          const answer = await new Promise<string>((resolve) => rl.question('Confirm? (y/N) ', resolve));
          rl.close();
          if (!answer.toLowerCase().startsWith('y')) {
            console.log(dim('Cancelled.'));
            return;
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
        handleError(err);
      }
    });
}
