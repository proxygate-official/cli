import type { Command } from 'commander';
import { loadConfig, saveConfig, CONFIG_PATH } from '../config.js';
import { green, dim } from '../format.js';

/**
 * Register the `proxygate logout` command.
 *
 * Removes the API key from config while preserving gateway URL and keypair.
 *
 * @example
 * proxygate logout
 */
export function registerLogoutCommand(program: Command): void {
  program
    .command('logout')
    .description('Remove API key from config (keypair preserved)')
    .action(async () => {
      const config = await loadConfig();
      if (!config?.apiKey) {
        console.log(dim('No API key in config. Nothing to remove.'));
        return;
      }

      // Preserve keypairPath if present; if only apiKey existed, save minimal config
      if (config.keypairPath) {
        await saveConfig({
          gatewayUrl: config.gatewayUrl,
          keypairPath: config.keypairPath,
        });
      } else {
        // No keypairPath — config will be invalid (no auth method).
        // Still save gatewayUrl so `proxygate login` picks it up next time.
        await saveConfig({ gatewayUrl: config.gatewayUrl });
      }

      console.log(green('API key removed from config.'));
      if (config.keypairPath) console.log(dim('Keypair and gateway URL preserved.'));
      console.log(dim(`Note: The key is NOT revoked server-side. Revoke it at app.proxygate.ai/keys`));
      console.log(dim(`Config: ${CONFIG_PATH}`));
    });
}
