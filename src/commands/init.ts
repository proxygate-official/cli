import type { Command } from 'commander';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { ProxyGateClient } from '@proxygate/sdk';
import { saveConfig, CONFIG_PATH } from '../config.js';
import { bold, green, yellow, red, dim, formatCurrency } from '../format.js';

/**
 * Register the `proxygate init` command.
 *
 * Detects wallet from keypair file, tests gateway connection,
 * and saves config to ~/.proxygate/config.json.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize ProxyGate CLI configuration')
    .option('--gateway <url>', 'Gateway URL', 'https://gateway.proxygate.ai')
    .option(
      '--keypair <path>',
      'Path to Solana keypair JSON file',
      '~/.config/solana/id.json',
    )
    .action(async (opts: { gateway: string; keypair: string }) => {
      console.log(bold('ProxyGate Init'));
      console.log();

      // Resolve keypair path (expand ~)
      let keypairPath = opts.keypair;
      if (keypairPath.startsWith('~')) {
        keypairPath = keypairPath.replace(/^~/, homedir());
      }
      keypairPath = resolve(keypairPath);

      // Check keypair file exists
      try {
        await access(keypairPath);
      } catch {
        console.error(red(`Keypair file not found: ${keypairPath}`));
        console.error(dim('Generate one with: solana-keygen new'));
        process.exit(1);
      }

      // Create client from keypair
      let client: ProxyGateClient;
      try {
        client = await ProxyGateClient.create({
          gatewayUrl: opts.gateway,
          keypairPath,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(red(`Failed to load keypair: ${message}`));
        process.exit(1);
      }

      console.log(`${green('Wallet:')} ${client.walletAddress}`);
      console.log(`${dim('Gateway:')} ${opts.gateway}`);
      console.log();

      // Test gateway connection (non-fatal)
      try {
        const balance = await client.balance();
        console.log(`${green('Balance:')} ${formatCurrency(balance.balance)}`);
      } catch {
        console.log(
          yellow('Warning: Could not connect to gateway. Config will still be saved.'),
        );
      }

      // Save config
      await saveConfig({ gatewayUrl: opts.gateway, keypairPath });
      console.log();
      console.log(`${green('Config saved to')} ${CONFIG_PATH}`);
      console.log(dim('Run `proxygate balance` to check your balance.'));
    });
}
