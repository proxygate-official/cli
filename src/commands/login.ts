import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import { ProxyGateClient, ProxyGateError } from '@proxygate/sdk';
import { loadConfig, saveConfig, CONFIG_PATH } from '../config.js';
import { bold, green, red, yellow, dim, formatUsdc } from '../format.js';

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Register the `proxygate login` command.
 *
 * Interactive auth setup: API key or wallet keypair.
 * Flags --key and --keypair skip the menu for scripted usage.
 */
export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with API key or wallet keypair')
    .option('--key <apiKey>', 'API key (starts with pg_live_)')
    .option('--keypair <path>', 'Path to keypair file')
    .option('--generate', 'Generate a new wallet keypair')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate login                            # interactive menu\n' +
        '  $ proxygate login --key pg_live_abc123...     # API key (for agents)\n' +
        '  $ proxygate login --keypair ~/id.json         # wallet keypair\n' +
        '  $ proxygate login --generate                  # generate new wallet\n\n' +
        'Get an API key: app.proxygate.ai/keys',
    )
    .action(async (opts: { key?: string; keypair?: string; generate?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string }>();
      const config = await loadConfig();
      const gatewayUrl = parentOpts.gateway ?? config?.gatewayUrl ?? 'https://gateway.proxygate.ai';

      // Direct flags — skip menu
      if (opts.key) {
        await loginWithApiKey(opts.key, gatewayUrl, config?.keypairPath);
        return;
      }
      if (opts.keypair || opts.generate) {
        // Delegate to init command logic
        const { execInitFlow } = await import('./init.js');
        await execInitFlow({ gateway: gatewayUrl, keypair: opts.keypair, generate: opts.generate });
        return;
      }

      // Interactive menu
      console.log(bold('ProxyGate Login'));
      console.log();
      console.log('  1. API key     ' + dim('For AI agents and automated access'));
      console.log('                 ' + dim('Get a key at app.proxygate.ai/keys'));
      console.log();
      console.log('  2. Wallet      ' + dim('Connect a Solana keypair for on-chain operations'));
      console.log('                 ' + dim('Import existing or generate new'));
      console.log();

      const choice = await ask('Choose auth method (1/2): ');

      if (choice === '1') {
        const key = await ask('API key: ');
        if (!key) { console.error(red('No key provided.')); process.exit(1); }
        await loginWithApiKey(key, gatewayUrl, config?.keypairPath);
      } else if (choice === '2') {
        console.log();
        console.log('  a. Import existing keypair');
        console.log('  b. Generate new keypair');
        console.log();
        const sub = await ask('Choose (a/b): ');

        const { execInitFlow } = await import('./init.js');
        if (sub === 'b') {
          await execInitFlow({ gateway: gatewayUrl, generate: true });
        } else {
          const path = await ask('Keypair path: ');
          if (!path) { console.error(red('No path provided.')); process.exit(1); }
          await execInitFlow({ gateway: gatewayUrl, keypair: path });
        }
      } else {
        console.error(red('Invalid choice. Use 1 or 2.'));
        process.exit(1);
      }
    });
}

async function loginWithApiKey(key: string, gatewayUrl: string, existingKeypairPath?: string): Promise<void> {
  if (!key.startsWith('pg_live_') || key.length < 20) {
    console.error(red('Invalid API key format. Keys start with pg_live_ and are 20+ characters.'));
    console.error(dim('Get a key: app.proxygate.ai/keys'));
    process.exit(1);
  }

  try {
    const client = new ProxyGateClient({ gatewayUrl, apiKey: key });
    const balance = await client.balance();
    console.log(green('Authenticated successfully'));
    console.log(dim(`Key: ${key.slice(0, 12)}...`));
    console.log(dim(`Balance: ${formatUsdc(balance.balance)}`));
  } catch (err) {
    if (err instanceof ProxyGateError && (err.statusCode === 401 || err.statusCode === 403)) {
      console.error(red(`Authentication failed: ${err.message}`));
      if (err.action) console.error(dim(err.action));
      process.exit(1);
    }
    console.log(yellow('Could not reach gateway. API key saved anyway.'));
  }

  await saveConfig({
    gatewayUrl,
    keypairPath: existingKeypairPath,
    apiKey: key,
  });
  console.log(green(`Config saved to ${CONFIG_PATH}`));
}
