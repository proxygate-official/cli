import type { Command } from 'commander';
import { createInterface } from 'node:readline';
import { loadConfig, saveConfig, CONFIG_PATH } from '../config.js';
import { green, yellow, red, dim } from '../format.js';

function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Register the `proxygate logout` command.
 *
 * Removes auth credentials from config.
 * --all removes both API key and keypair (with confirmation).
 * Default removes only the API key.
 */
export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Remove auth credentials from config')
    .option('--all', 'Remove both API key and keypair (requires confirmation)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate logout        # remove API key only\n' +
        '  $ proxygate logout --all  # remove all auth (API key + keypair)',
    )
    .action(async (opts: { all?: boolean }) => {
      const config = await loadConfig();

      if (opts.all) {
        if (!config?.apiKey && !config?.keypairPath) {
          console.log(dim('No auth credentials in config. Nothing to remove.'));
          return;
        }

        console.log(red('This will remove all auth credentials:'));
        if (config?.apiKey) console.log(`  API key: ${dim(config.apiKey.slice(0, 12) + '...')}`);
        if (config?.keypairPath) console.log(`  Keypair: ${dim(config.keypairPath)}`);
        console.log();

        const yes = await confirm('Are you sure? (y/N) ');
        if (!yes) {
          console.log(dim('Cancelled.'));
          return;
        }

        await saveConfig({ gatewayUrl: config?.gatewayUrl ?? 'https://gateway.proxygate.ai' });
        console.log(green('All auth credentials removed from config.'));
        console.log(yellow('Run `proxygate login` to reconfigure.'));
        if (config?.apiKey) {
          console.log(dim('Note: API key is NOT revoked server-side. Revoke at app.proxygate.ai/wallets'));
        }
        if (config?.keypairPath) {
          console.log(dim(`Note: Keypair file not deleted (${config.keypairPath}). Remove manually if needed.`));
        }
        console.log(dim(`Config: ${CONFIG_PATH}`));
        return;
      }

      // Default: remove API key only
      if (!config?.apiKey) {
        console.log(dim('No API key in config. Nothing to remove.'));
        return;
      }

      if (config.keypairPath) {
        await saveConfig({
          gatewayUrl: config.gatewayUrl,
          keypairPath: config.keypairPath,
        });
      } else {
        await saveConfig({ gatewayUrl: config.gatewayUrl });
      }

      console.log(green('API key removed from config.'));
      if (config.keypairPath) {
        console.log(dim('Keypair and gateway URL preserved.'));
      } else {
        console.log(yellow('Warning: No auth method remaining. Run `proxygate login` to reconfigure.'));
      }
      console.log(dim('Note: The key is NOT revoked server-side. Revoke it at app.proxygate.ai/wallets'));
      console.log(dim(`Config: ${CONFIG_PATH}`));
    });
}
