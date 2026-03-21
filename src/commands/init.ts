import type { Command } from 'commander';
import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import nacl from 'tweetnacl';
import { ProxyGateClient } from '@proxygate/sdk';
import { loadConfig, saveConfig, CONFIG_DIR, CONFIG_PATH } from '../config.js';
import { bold, green, yellow, red, dim, formatCurrency } from '../format.js';
import { parseKeypair } from '../keypair.js';

const DEFAULT_KEYPAIR_PATH = `${CONFIG_DIR}/keypair.json`;

/**
 * Register the `proxygate init` command.
 *
 * Walks through wallet setup (generate / import), tests gateway,
 * and saves config.
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init', { hidden: true })
    .description('Initialize ProxyGate (use `proxygate login` instead)')
    .option('--gateway <url>', 'Gateway URL', 'https://gateway.proxygate.ai')
    .option('--keypair <path>', 'Path to existing keypair file (any format)')
    .option('--generate', 'Generate a new keypair')
    .addHelpText(
      'after',
      '\nSupported keypair formats:\n' +
        '  - JSON array of 64 numbers (Solana CLI / solana-keygen)\n' +
        '  - JSON array of 32 numbers (seed only)\n' +
        '  - Base58 private key (Phantom wallet export)\n' +
        '  - Base64 / Hex encoded keys\n\n' +
        'Examples:\n' +
        '  $ proxygate init                           # auto-detect or generate keypair\n' +
        '  $ proxygate init --generate                # generate new keypair\n' +
        '  $ proxygate init --keypair ~/phantom.txt   # import Phantom base58 key\n' +
        '  $ proxygate init --keypair ~/id.json       # import Solana CLI keypair\n',
    )
    .action(async (opts: { gateway: string; keypair?: string; generate?: boolean }) => {
      await execInitFlow(opts);
    });
}

/** Shared init flow — used by both `init` and `login --keypair/--generate`. */
export async function execInitFlow(opts: { gateway: string; keypair?: string; generate?: boolean }): Promise<void> {
  console.log(bold('ProxyGate Wallet Setup'));
  console.log();

  if (opts.keypair && opts.generate) {
    console.error(red('Cannot use both --keypair and --generate'));
    process.exit(1);
  }

  let keypairPath: string;

  if (opts.generate) {
    keypairPath = await generateKeypair();
  } else if (opts.keypair) {
    keypairPath = await importKeypair(resolvePath(opts.keypair));
  } else {
    // Auto-detect existing keypair
    const candidates = [DEFAULT_KEYPAIR_PATH, resolvePath('~/.config/solana/id.json')];
    let found: string | null = null;
    for (const c of candidates) {
      try { await access(c); found = c; break; } catch { /* not found */ }
    }

    if (found) {
      keypairPath = found;
      console.log(dim(`Using existing keypair: ${keypairPath}`));
    } else {
      console.log('No keypair found. Generating a new one...');
      console.log();
      keypairPath = await generateKeypair();
    }
  }

  // Create client from keypair
  let client: ProxyGateClient;
  try {
    client = await ProxyGateClient.create({ gatewayUrl: opts.gateway, keypairPath });
  } catch (err) {
    console.error(red(`Failed to load keypair: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  console.log(`${green('Wallet:')} ${client.walletAddress}`);
  console.log(`${dim('Gateway:')} ${opts.gateway}`);
  console.log();

  // Test gateway + balance
  try {
    const balance = await client.balance();
    console.log(`${green('Balance:')} ${formatCurrency(balance.balance)}`);
  } catch {
    console.log(yellow('Could not connect to gateway. Config will still be saved.'));
    console.log();
    console.log(dim('To receive USDC payouts (jobs, seller earnings), your wallet needs'));
    console.log(dim('a USDC token account. Create one at app.proxygate.ai or it will'));
    console.log(dim('be set up automatically with your first deposit.'));
  }

  // Save config (preserve existing API key)
  const existing = await loadConfig();
  console.log();
  await saveConfig({ gatewayUrl: opts.gateway, keypairPath, apiKey: existing?.apiKey });
  console.log(`${green('Config saved to')} ${CONFIG_PATH}`);
  console.log();
  console.log(bold('Next steps:'));
  console.log(dim('  proxygate deposit -a 1000000    # deposit 1 USDC'));
  console.log(dim('  proxygate balance               # check balance'));
  console.log(dim('  proxygate apis                  # browse available APIs'));
}

function resolvePath(path: string): string {
  if (path.startsWith('~')) return resolve(path.replace(/^~/, homedir()));
  return resolve(path);
}

/** Import a keypair from any supported format, convert to Solana CLI format. */
async function importKeypair(sourcePath: string): Promise<string> {
  try {
    await access(sourcePath);
  } catch {
    console.error(red(`File not found: ${sourcePath}`));
    process.exit(1);
  }

  const raw = await readFile(sourcePath, 'utf-8');
  let parsed: ReturnType<typeof parseKeypair>;
  try {
    parsed = parseKeypair(raw);
  } catch (err) {
    console.error(red(`Failed to parse keypair: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }

  console.log(dim(`Detected format: ${parsed.format}`));

  // Check if source is already a valid 64-byte JSON array (Solana CLI format)
  const trimmed = raw.trim();
  const isAlreadySolanaFormat = trimmed.startsWith('[') && (() => {
    try { const a = JSON.parse(trimmed); return Array.isArray(a) && a.length === 64; } catch { return false; }
  })();

  if (isAlreadySolanaFormat) {
    // Source file is already in the right format — use it directly
    console.log(green(`Keypair ready: ${sourcePath}`));
    console.log();
    return sourcePath;
  }

  // Convert to Solana CLI format and save to default path
  await mkdir(CONFIG_DIR, { recursive: true });
  const destPath = DEFAULT_KEYPAIR_PATH;
  await writeFile(destPath, JSON.stringify(parsed.secretKey) + '\n', { mode: 0o600 });
  console.log(green(`Converted and saved to: ${destPath}`));
  console.log();
  return destPath;
}

/** Generate a fresh ed25519 keypair. */
async function generateKeypair(): Promise<string> {
  const seed = randomBytes(32);
  const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(seed));

  await mkdir(CONFIG_DIR, { recursive: true });
  const path = DEFAULT_KEYPAIR_PATH;
  await writeFile(path, JSON.stringify(Array.from(keypair.secretKey)) + '\n', { mode: 0o600 });

  // Use the client to derive base58 wallet address
  const tempClient = await ProxyGateClient.create({ gatewayUrl: 'https://gateway.proxygate.ai', keypairPath: path });

  console.log(`${green('Generated keypair:')} ${path}`);
  console.log(`${green('Public key:')} ${tempClient.walletAddress}`);
  console.log();
  console.log(yellow('Important: back up this file! If you lose it, you lose access to your wallet.'));
  console.log();

  return path;
}
