import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { ProxyGateClient, ProxyGateError } from '@proxygate/sdk';
import type { PricingServiceEntry } from '@proxygate/sdk';
import { saveConfig, loadConfig, CONFIG_PATH } from '../config.js';
import { bold, green, yellow, red, dim, cyan, formatTable, formatUsdc } from '../format.js';

const DEFAULT_KEYPAIR_PATHS = ['~/.proxygate/keypair.json', '~/.config/solana/id.json'];

function expandPath(p: string): string { return resolve(p.replace(/^~/, homedir())); }

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function formatPrice(svc: PricingServiceEntry): string {
  if (svc.pricing_unit === 'per_token' || svc.pricing_unit === 'both') {
    return `$${svc.price_per_input_token_usdc ?? 0}/$${svc.price_per_output_token_usdc ?? 0} per token`;
  }
  return `$${svc.price_per_request_usdc} per req`;
}

/** Step 1: Find a Solana keypair from flags, config, or default paths. */
export async function findKeypair(explicitPath?: string): Promise<string | null> {
  console.log(bold(`${cyan('Step 1')} — Find your Solana keypair`));
  console.log();

  if (explicitPath) {
    const resolved = expandPath(explicitPath);
    if (await fileExists(resolved)) { console.log(`  ${green('Found:')} ${resolved}`); console.log(); return resolved; }
    console.log(`  ${red('Not found:')} ${resolved}`);
  }

  const config = await loadConfig();
  if (config?.keypairPath) {
    const resolved = expandPath(config.keypairPath);
    if (await fileExists(resolved)) { console.log(`  ${green('Found from config:')} ${resolved}`); console.log(); return resolved; }
  }

  for (const candidate of DEFAULT_KEYPAIR_PATHS) {
    const resolved = expandPath(candidate);
    if (await fileExists(resolved)) { console.log(`  ${green('Found:')} ${resolved}`); console.log(); return resolved; }
  }

  console.log(`  ${yellow('No keypair found.')}`);
  console.log();
  console.log('  Generate one with:');
  console.log(`  ${cyan('$ solana-keygen new --outfile ~/.proxygate/keypair.json --no-bip39-passphrase')}`);
  console.log();
  console.log(dim('  Then run this command again.'));
  console.log();
  return null;
}

/** Step 2: Create client and save config. Returns client or null on failure. */
export async function connectGateway(gatewayUrl: string, keypairPath: string): Promise<ProxyGateClient | null> {
  console.log(bold(`${cyan('Step 2')} — Connect to the gateway`));
  console.log();

  let client: ProxyGateClient;
  try {
    client = await ProxyGateClient.create({ gatewayUrl, keypairPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  ${red('Failed to load keypair:')} ${message}`);
    console.log(dim('  Make sure the file contains a JSON array of 64 numbers.'));
    return null;
  }

  console.log(`  ${green('Wallet:')}  ${client.walletAddress}`);
  console.log(`  ${dim('Gateway:')} ${gatewayUrl}`);
  await saveConfig({ gatewayUrl, keypairPath });
  console.log(`  ${dim('Config:')}  ${CONFIG_PATH}`);
  console.log();
  return client;
}

/** Step 3: Check vault balance. Returns whether user has a positive balance. */
export async function checkBalance(client: ProxyGateClient, gatewayUrl: string): Promise<boolean> {
  console.log(bold(`${cyan('Step 3')} — Check your balance`));
  console.log();

  try {
    const balance = await client.vault.balance();
    console.log(`  ${green('Total:')}     ${formatUsdc(balance.balance)}`);
    console.log(`  ${green('Available:')} ${formatUsdc(balance.available)}`);
    if (balance.pending_settlement > 0) console.log(`  ${dim('Pending:')}   ${formatUsdc(balance.pending_settlement)}`);
    console.log();
    return balance.available > 0;
  } catch (err) {
    if (err instanceof ProxyGateError) {
      console.log(err.code === 'vault_not_found'
        ? `  ${dim('No vault yet — it will be created on your first deposit.')}`
        : `  ${yellow(`Could not fetch balance: ${err.message}`)}`);
    } else {
      console.log(`  ${yellow('Could not connect to gateway. Is it running?')}`);
      console.log(`  ${dim(`URL: ${gatewayUrl}`)}`);
    }
    console.log();
    return false;
  }
}

/** Step 4: Show available APIs from the pricing endpoint. */
export async function showApis(client: ProxyGateClient): Promise<void> {
  console.log(bold(`${cyan('Step 4')} — Available APIs`));
  console.log();
  try {
    const pricing = await client.pricing();
    if (pricing.services.length === 0) { console.log(dim('  No APIs listed yet.')); }
    else {
      const headers = ['Service', 'Price', 'Sellers', 'RPM'];
      const rows = pricing.services.map((svc) => [
        `${svc.name} (${svc.service})`, formatPrice(svc), String(svc.sellers), String(svc.available_rpm),
      ]);
      for (const line of formatTable(headers, rows).split('\n')) console.log(`  ${line}`);
      console.log();
      console.log(dim('  Use `proxygate pricing --json` to see full details.'));
    }
  } catch { console.log(dim('  Could not fetch pricing.')); }
  console.log();
}

/** Step 5: Show next steps based on balance status. */
export function showNextSteps(hasBalance: boolean): void {
  console.log(bold(`${cyan('Step 5')} — Next steps`));
  console.log();
  if (!hasBalance) {
    console.log('  You need credits to make proxy requests.');
    console.log();
    console.log(bold('  Prerequisites:'));
    console.log(`    1. Your wallet needs a ${bold('USDC token account')} on Solana mainnet`);
    console.log('    2. Fund it with USDC');
    console.log('    3. Keep some SOL for transaction fees (~0.01 SOL)');
    console.log();
    console.log(dim('  Create a USDC token account (if you don\'t have one):'));
    console.log(`  ${cyan('$ spl-token create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')}`);
    console.log();
    console.log('  Then deposit:');
    console.log(`  ${cyan('$ proxygate deposit -a 5000000')}     ${dim('# Deposit 5 USDC')}`);
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
}
