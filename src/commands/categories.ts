import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, red, dim, cyan, formatTable } from '../format.js';

export function registerCategoriesCommand(program: Command): void {
  program
    .command('categories')
    .description('List API categories (no auth required)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate categories\n' +
        '  $ proxygate categories --json',
    )
    .action(async () => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.categories();

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.categories.length === 0) {
          console.log(dim('No categories available.'));
          return;
        }

        console.log(bold('Categories'));
        console.log();

        const headers = ['Category', 'Listings', 'Subcategories'];
        const rows = result.categories.map((c) => [
          `${c.icon} ${bold(cyan(c.name))} ${dim(`(${c.slug})`)}`,
          String(c.listing_count),
          c.subcategories.map((s) => s.name).join(', ') || dim('none'),
        ]);

        console.log(formatTable(headers, rows));
      } catch (err) {
        if (err instanceof ProxyGateError) {
          console.error(red(`Error [${err.code}]: ${err.message}`));
          if (err.action) console.error(dim(`Suggestion: ${err.action}`));
          process.exit(1);
        }
        throw err;
      }
    });
}
