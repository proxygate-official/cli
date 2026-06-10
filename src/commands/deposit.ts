import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import { ProxygateError } from '@proxygate/sdk';
import type { ProxygateClient, VaultDepositResponse } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { loadConfig } from '../config.js';
import { bold, green, yellow, red, dim, formatUsdc } from '../format.js';
import { handleError } from '../errors.js';

const CONFIRM_THRESHOLD = 5_000_000; // 5 USDC

/**
 * Run the deposit on-chain. Gasless-first: try the x402 top-up rail (Proxygate
 * covers network fees, so buyers need zero SOL). A 503 means the rail is off,
 * so fall back to the self-paid deposit. --legacy forces that path directly.
 */
async function runDeposit(
  client: ProxygateClient,
  amount: number,
  rpcUrl: string | undefined,
  legacy: boolean,
): Promise<VaultDepositResponse> {
  const opts = { amount, ...(rpcUrl ? { rpcUrl } : {}) };

  if (legacy) {
    return client.vault.deposit(opts);
  }

  try {
    return await client.vault.topupX402(opts);
  } catch (err) {
    if (err instanceof ProxygateError && err.statusCode === 503) {
      console.log(dim('Gasless rail is off right now. Falling back to a self-paid deposit (you pay the network fee).'));
      return client.vault.deposit(opts);
    }
    throw err;
  }
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
    .description('Deposit USDC from your Solana wallet into your Proxygate vault')
    .requiredOption(
      '-a, --amount <lamports>',
      'Amount in USDC base units (1 USDC = 1,000,000 lamports)',
    )
    .option('--rpc <url>', 'Solana RPC URL (default: mainnet-beta)')
    .option('--legacy', 'Force the self-paid deposit path (you pay the network fee in SOL)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--dry-run', 'Show what would happen without sending the transaction')
    .addHelpText(
      'after',
      '\nExamples (1 USDC = 1,000,000 base units):\n' +
        '  $ proxygate deposit -a 1000000     # Deposit 1 USDC\n' +
        '  $ proxygate deposit -a 5000000     # Deposit 5 USDC\n' +
        '  $ proxygate deposit -a 10000000    # Deposit 10 USDC\n\n' +
        'Fees:\n' +
        '  Proxygate covers the network fee for deposits (a small USDC fee applies).\n' +
        '  You never need SOL. Pass --legacy to pay the network fee yourself in SOL.\n\n' +
        'Prerequisites:\n' +
        '  Your wallet needs a USDC token account (ATA) on Solana mainnet.\n' +
        '  Create one if needed: spl-token create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\n\n' +
        'The vault auto-initializes on your first deposit.',
    )
    .action(async (opts: { amount: string; rpc?: string; legacy?: boolean; yes?: boolean; dryRun?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const amount = parseInt(opts.amount, 10);
        if (isNaN(amount) || amount <= 0) {
          console.error(red('Error: --amount must be a positive integer (USDC base units)'));
          process.exit(1);
        }

        // Delegation token without keypair — open browser for TX approval
        const config = await loadConfig();
        if (config?.delegationToken && !config.keypairPath) {
          const { startCallbackServer } = await import('../lib/localhost-server.js');
          const { openBrowser } = await import('../lib/browser.js');

          const { port, state, waitForCallback, close } = await startCallbackServer();
          const url = `https://app.proxygate.ai/cli-tx?type=deposit&amount=${amount}&wallet=${config.wallet ?? ''}&port=${port}&state=${state}`;

          console.log(dim('Opening browser to approve transaction...'));
          openBrowser(url);
          console.log(dim('Waiting for approval... (Ctrl+C to cancel)'));

          try {
            await waitForCallback();
            console.log(green(`Deposit confirmed: ${formatUsdc(amount)} USDC`));
          } catch {
            console.error(red('Transaction approval timed out or failed.'));
            process.exit(1);
          } finally {
            close();
          }
          return;
        }

        const client = await getClient(parentOpts);

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
          console.log(bold('Dry run: no transaction sent'));
          console.log();
          console.log(`  ${dim('Amount:')}   ${usdc} USDC (${amount} base units)`);
          console.log(`  ${dim('Gateway:')}  ${client.gatewayUrl}`);
          console.log(`  ${dim('Wallet:')}   ${client.walletAddress}`);
          console.log(`  ${dim('Path:')}     ${opts.legacy ? 'legacy self-paid (you pay SOL fee)' : 'gasless (Proxygate covers the network fee)'}`);
          return;
        }

        const result = await runDeposit(client, amount, opts.rpc, opts.legacy ?? false);

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
