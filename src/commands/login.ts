import type { Command } from 'commander';
import { ProxyGateClient, ProxyGateError } from '@proxygate/sdk';
import { loadConfig, saveConfig, CONFIG_PATH } from '../config.js';
import { green, red, yellow, dim, formatUsdc } from '../format.js';

/**
 * Register the `proxygate login` command.
 *
 * Authenticates with an API key and stores it in config.
 *
 * @example
 * proxygate login --key pg_live_abc123...
 */
export function registerLoginCommand(program: Command): void {
  program
    .command('login')
    .description('Authenticate with an API key')
    .requiredOption('--key <apiKey>', 'API key (starts with pg_live_)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate login --key pg_live_abc123...   # store API key\n\n' +
        'Get a key: app.proxygate.ai/keys',
    )
    .action(async (opts: { key: string }) => {
      const parentOpts = program.opts<{ gateway?: string }>();

      // Format validation
      if (!opts.key.startsWith('pg_live_') || opts.key.length < 20) {
        console.error(red('Invalid API key format. Keys start with pg_live_ and are 20+ characters.'));
        console.error(dim('Get a key: app.proxygate.ai/keys'));
        process.exit(1);
      }

      const config = await loadConfig();
      const gatewayUrl = parentOpts.gateway ?? config?.gatewayUrl ?? 'https://gateway.proxygate.ai';

      // Test key against gateway
      try {
        const client = new ProxyGateClient({ gatewayUrl, apiKey: opts.key });
        const balance = await client.balance();
        console.log(green('Authenticated successfully'));
        console.log(dim(`Key: ${opts.key.slice(0, 12)}...`));
        console.log(dim(`Balance: ${formatUsdc(balance.balance)}`));
      } catch (err) {
        if (err instanceof ProxyGateError && (err.statusCode === 401 || err.statusCode === 403)) {
          console.error(red(`Authentication failed: ${err.message}`));
          if (err.action) console.error(dim(err.action));
          process.exit(1);
        }
        console.log(yellow('Could not reach gateway. API key saved anyway.'));
      }

      // Save to config (preserve existing fields)
      await saveConfig({
        gatewayUrl,
        keypairPath: config?.keypairPath,
        apiKey: opts.key,
      });
      console.log(green(`Config saved to ${CONFIG_PATH}`));
    });
}
