import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { dim } from '../../format.js';
import { handleError, loadPrompts } from './helpers.js';

/** Register the `listings delete` subcommand. */
export function registerDeleteSubcommand(listings: Command, program: Command): void {
  listings
    .command('delete <id>')
    .description('Delete a listing (removes API key from Secret Manager)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            console.error('Use --yes (-y) to confirm deletion in non-interactive mode.');
            process.exit(1);
          }
          const { confirm } = await loadPrompts();
          const confirmed = await confirm({
            message: 'Are you sure? This will delete the API key from Secret Manager.',
          });
          if (!confirmed) {
            console.log(dim('Cancelled.'));
            return;
          }
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.delete(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}
