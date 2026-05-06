import type { Command } from 'commander';
import { ProxygateClient, ProxygateError } from '@proxygate/sdk';
import { loadConfig, CONFIG_PATH } from '../config.js';
import { getClient } from '../helpers.js';
import { bold, green, dim, yellow, formatUsdc } from '../format.js';

/**
 * Register the `proxygate whoami` command.
 *
 * Shows the current auth status, config, and live balance.
 *
 * @example
 * proxygate whoami
 * proxygate whoami --json
 */
export function registerWhoamiCommand(program: Command): void {
  program
    .command('whoami')
    .description('Show current auth status and configuration')
    .action(async () => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; apiKey?: string; json?: boolean }>();
      const config = await loadConfig();

      if (!config) {
        console.error(yellow('Not configured. Run `proxygate init` or `proxygate login` first.'));
        process.exit(1);
      }

      const hasApiKey = !!config.apiKey;
      const hasKeypair = !!config.keypairPath;

      let authMode: string;
      if (hasApiKey && hasKeypair) authMode = 'Dual (API key + Keypair)';
      else if (hasApiKey) authMode = 'API key';
      else authMode = 'Keypair';

      // Derive wallet address if keypair available
      let walletAddress: string | undefined;
      if (hasKeypair) {
        try {
          const kpClient = await ProxygateClient.create({
            gatewayUrl: config.gatewayUrl,
            keypairPath: config.keypairPath!,
          });
          walletAddress = kpClient.walletAddress;
        } catch {
          // Keypair file missing or invalid
        }
      }

      if (parentOpts.json) {
        const info: Record<string, unknown> = {
          authMode,
          gateway: config.gatewayUrl,
          config: CONFIG_PATH,
        };
        if (hasApiKey) info.apiKeyPrefix = config.apiKey!.slice(0, 12) + '...';
        if (walletAddress) info.wallet = walletAddress;

        // Try live balance
        try {
          const client = await getClient(parentOpts);
          const balance = await client.balance();
          info.balance = balance.balance;
        } catch {
          // Offline
        }

        console.log(JSON.stringify(info, null, 2));
        return;
      }

      console.log(bold('Proxygate Auth'));
      console.log();
      console.log(`  ${green('Auth mode:')}  ${authMode}`);
      if (hasApiKey) {
        console.log(`  ${dim('API key:')}    ${config.apiKey!.slice(0, 12)}...`);
      }
      if (walletAddress) {
        console.log(`  ${dim('Wallet:')}     ${walletAddress}`);
      } else if (hasKeypair) {
        console.log(`  ${dim('Wallet:')}     ${yellow('(could not load keypair)')}`);
      }
      console.log(`  ${dim('Gateway:')}    ${config.gatewayUrl}`);
      console.log(`  ${dim('Config:')}     ${CONFIG_PATH}`);

      // Live balance check
      try {
        const client = await getClient(parentOpts);
        const balance = await client.balance();
        console.log();
        console.log(`  ${green('Balance:')}    ${formatUsdc(balance.balance)}`);
      } catch (err) {
        if (err instanceof ProxygateError) {
          console.log();
          console.log(`  ${dim('Balance:')}    ${yellow('offline')}`);
        }
      }
    });
}
