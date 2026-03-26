import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { green, red } from '../../format.js';
import { handleError, printTestResults } from './helpers.js';

/** Register the `listings test <id>` subcommand. */
export function registerTestSubcommand(listings: Command, program: Command): void {
  listings
    .command('test <id>')
    .description('Test endpoints for an existing listing')
    .action(async (id: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.test(id);

        printTestResults(result);

        if (result.test_passed && result.activated) {
          console.log();
          console.log(green('Tests passed. Listing activated.'));
        } else if (!result.test_passed) {
          console.log();
          console.log(red('Tests failed. Listing remains inactive.'));
          process.exit(1);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
