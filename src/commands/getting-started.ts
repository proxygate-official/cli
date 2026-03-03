import type { Command } from 'commander';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { ProxyGateClient, ProxyGateError } from '@proxygate/sdk';
import type { PricingServiceEntry } from '@proxygate/sdk';
import { saveConfig, loadConfig, CONFIG_PATH } from '../config.js';
import { bold, green, yellow, red, dim, cyan, formatCurrency, formatTable } from '../format.js';

const DEFAULT_GATEWAY = 'https://gateway.proxygate.ai';
const DEFAULT_KEYPAIR_PATHS = [
  '~/.proxygate/keypair.json',
  '~/.config/solana/id.json',
];

function expandPath(p: string): string {
  return resolve(p.replace(/^~/, homedir()));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function formatPrice(svc: PricingServiceEntry): string {
  if (svc.pricing_unit === 'per_token' || svc.pricing_unit === 'both') {
    const input = svc.price_per_input_token_usdc ?? 0;
    const output = svc.price_per_output_token_usdc ?? 0;
    return `$${input}/$${output} per token`;
  }
  return `$${svc.price_per_request_usdc} per req`;
}

function formatUsdc(lamports: number): string {
  return `${(lamports / 1_000_000).toFixed(6)} USDC`;
}

/**
 * Register the `proxygate getting-started` command.
 *
 * Interactive walkthrough that checks keypair, configures the CLI,
 * tests gateway connectivity, and shows available APIs.
 */
export function registerGettingStartedCommand(program: Command): void {
  program
    .command('getting-started')
    .description('Interactive setup guide — start here if you are new')
    .option('--gateway <url>', 'Gateway URL', DEFAULT_GATEWAY)
    .option('--keypair <path>', 'Path to Solana keypair JSON file')
    .addHelpText(
      'after',
      '\nThis command walks you through:\n' +
        '  1. Finding or creating a Solana keypair\n' +
        '  2. Configuring the CLI\n' +
        '  3. Testing gateway connectivity\n' +
        '  4. Checking your balance\n' +
        '  5. Browsing available APIs\n' +
        '  6. Showing next steps',
    )
    .action(async (opts: { gateway: string; keypair?: string }) => {
      console.log();
      console.log(bold('Welcome to ProxyGate'));
      console.log(dim('The Airbnb for API capacity — buy access to AI APIs with USDC on Solana.'));
      console.log();

      // -----------------------------------------------------------------------
      // Step 1: Find keypair
      // -----------------------------------------------------------------------
      console.log(bold(`${cyan('Step 1')} — Find your Solana keypair`));
      console.log();

      let keypairPath: string | null = null;

      // Check explicit flag first
      if (opts.keypair) {
        const resolved = expandPath(opts.keypair);
        if (await fileExists(resolved)) {
          keypairPath = resolved;
          console.log(`  ${green('Found:')} ${resolved}`);
        } else {
          console.log(`  ${red('Not found:')} ${resolved}`);
        }
      }

      // Check existing config
      if (!keypairPath) {
        const config = await loadConfig();
        if (config?.keypairPath) {
          const resolved = expandPath(config.keypairPath);
          if (await fileExists(resolved)) {
            keypairPath = resolved;
            console.log(`  ${green('Found from config:')} ${resolved}`);
          }
        }
      }

      // Try default locations
      if (!keypairPath) {
        for (const candidate of DEFAULT_KEYPAIR_PATHS) {
          const resolved = expandPath(candidate);
          if (await fileExists(resolved)) {
            keypairPath = resolved;
            console.log(`  ${green('Found:')} ${resolved}`);
            break;
          }
        }
      }

      if (!keypairPath) {
        console.log(`  ${yellow('No keypair found.')}`);
        console.log();
        console.log('  Generate one with:');
        console.log(
          `  ${cyan('$ solana-keygen new --outfile ~/.proxygate/keypair.json --no-bip39-passphrase')}`,
        );
        console.log();
        console.log(dim('  Then run this command again.'));
        console.log();
        return;
      }

      console.log();

      // -----------------------------------------------------------------------
      // Step 2: Create client and save config
      // -----------------------------------------------------------------------
      console.log(bold(`${cyan('Step 2')} — Connect to the gateway`));
      console.log();

      let client: ProxyGateClient;
      try {
        client = await ProxyGateClient.create({
          gatewayUrl: opts.gateway,
          keypairPath,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`  ${red('Failed to load keypair:')} ${message}`);
        console.log(dim('  Make sure the file contains a JSON array of 64 numbers.'));
        return;
      }

      console.log(`  ${green('Wallet:')}  ${client.walletAddress}`);
      console.log(`  ${dim('Gateway:')} ${opts.gateway}`);

      // Save config
      await saveConfig({ gatewayUrl: opts.gateway, keypairPath });
      console.log(`  ${dim('Config:')}  ${CONFIG_PATH}`);
      console.log();

      // -----------------------------------------------------------------------
      // Step 3: Check balance
      // -----------------------------------------------------------------------
      console.log(bold(`${cyan('Step 3')} — Check your balance`));
      console.log();

      let hasBalance = false;
      try {
        const balance = await client.vault.balance();
        hasBalance = balance.available > 0;

        console.log(`  ${green('Total:')}     ${formatUsdc(balance.balance)}`);
        console.log(`  ${green('Available:')} ${formatUsdc(balance.available)}`);
        if (balance.pending_settlement > 0) {
          console.log(`  ${dim('Pending:')}   ${formatUsdc(balance.pending_settlement)}`);
        }
      } catch (err) {
        if (err instanceof ProxyGateError) {
          if (err.code === 'vault_not_found') {
            console.log(`  ${dim('No vault yet — it will be created on your first deposit.')}`);
          } else {
            console.log(`  ${yellow(`Could not fetch balance: ${err.message}`)}`);
          }
        } else {
          console.log(`  ${yellow('Could not connect to gateway. Is it running?')}`);
          console.log(`  ${dim(`URL: ${opts.gateway}`)}`);
        }
      }
      console.log();

      // -----------------------------------------------------------------------
      // Step 4: Show available APIs
      // -----------------------------------------------------------------------
      console.log(bold(`${cyan('Step 4')} — Available APIs`));
      console.log();

      try {
        const pricing = await client.pricing();

        if (pricing.services.length === 0) {
          console.log(dim('  No APIs listed yet.'));
        } else {
          const headers = ['Service', 'Price', 'Sellers', 'RPM'];
          const rows = pricing.services.map((svc) => [
            `${svc.name} (${svc.service})`,
            formatPrice(svc),
            String(svc.sellers),
            String(svc.available_rpm),
          ]);
          const table = formatTable(headers, rows);
          // Indent each line
          for (const line of table.split('\n')) {
            console.log(`  ${line}`);
          }
          console.log();
          console.log(dim('  Use `proxygate pricing --json` to see full details.'));
        }
      } catch {
        console.log(dim('  Could not fetch pricing.'));
      }
      console.log();

      // -----------------------------------------------------------------------
      // Step 5: Next steps
      // -----------------------------------------------------------------------
      console.log(bold(`${cyan('Step 5')} — Next steps`));
      console.log();

      if (!hasBalance) {
        console.log('  You need credits to make proxy requests.');
        console.log();
        console.log(`  ${cyan('$ proxygate deposit -a 5000000')}     ${dim('# Deposit 5 USDC')}`);
        console.log();
        console.log(dim('  Make sure your wallet has USDC and SOL for transaction fees.'));
      } else {
        console.log('  You have credits! Try a proxy request:');
        console.log();
        console.log(`  ${cyan('$ proxygate proxy <listing-id> /v1/chat/completions \\\\')}`)
        console.log(`  ${cyan("    -d '{\"model\":\"gpt-4\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'")}`);
      }

      console.log();
      console.log(dim('  Useful commands:'));
      console.log(`    ${dim('proxygate balance')}    ${dim('— Check your balance')}`);
      console.log(`    ${dim('proxygate pricing')}    ${dim('— Browse APIs')}`);
      console.log(`    ${dim('proxygate usage')}      ${dim('— View usage history')}`);
      console.log(`    ${dim('proxygate --help')}     ${dim('— All commands')}`);
      console.log();
      console.log(dim('  Docs: https://gateway.proxygate.ai/docs'));
      console.log();
    });
}
