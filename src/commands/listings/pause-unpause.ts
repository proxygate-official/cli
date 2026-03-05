import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { handleError } from './helpers.js';

/** Register the `listings pause` subcommand. */
export function registerPauseSubcommand(listings: Command, program: Command): void {
  listings
    .command('pause <id>')
    .description('Pause a listing (removes from marketplace routing)')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.pause(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

/** Register the `listings unpause` subcommand. */
export function registerUnpauseSubcommand(listings: Command, program: Command): void {
  listings
    .command('unpause <id>')
    .description('Unpause a listing (re-enables marketplace routing)')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.unpause(id);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}
