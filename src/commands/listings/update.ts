import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { red, dim } from '../../format.js';
import { handleError } from './helpers.js';

/** Register the `listings update` subcommand. */
export function registerUpdateSubcommand(listings: Command, program: Command): void {
  listings
    .command('update <id>')
    .description('Update a listing (capacity, pricing, categories, description, paths)')
    .option('--total-rpm <n>', 'Total RPM capacity')
    .option('--reserved-rpm <n>', 'Reserved RPM')
    .option('--price <n>', 'Price per request in micro-cents')
    .option('--categories <slugs>', 'Category slugs (comma-separated)')
    .option('--description <text>', 'Listing description')
    .option('--allowed-paths <paths>', 'Allowed paths (comma-separated)')
    .option('--endpoints <file>', 'Path to JSON file containing EndpointSpec[]')
    .action(async (id: string, opts: {
      totalRpm?: string;
      reservedRpm?: string;
      price?: string;
      categories?: string;
      description?: string;
      allowedPaths?: string;
      endpoints?: string;
    }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const updates: Record<string, unknown> = {};
        if (opts.totalRpm !== undefined) updates.total_rpm = parseInt(opts.totalRpm, 10);
        if (opts.reservedRpm !== undefined) updates.reserved_rpm = parseInt(opts.reservedRpm, 10);
        if (opts.price !== undefined) updates.price_per_request = parseInt(opts.price, 10);
        if (opts.categories !== undefined) updates.category_slugs = opts.categories.split(',').map((s) => s.trim());
        if (opts.description !== undefined) updates.description = opts.description;
        if (opts.allowedPaths !== undefined) updates.allowed_paths = opts.allowedPaths.split(',').map((s) => s.trim());
        if (opts.endpoints !== undefined) updates.endpoints = JSON.parse(await readFile(opts.endpoints, 'utf-8'));

        if (Object.keys(updates).length === 0) {
          console.error(red('Error: at least one update flag is required'));
          console.error(dim('Available: --total-rpm, --reserved-rpm, --price, --categories, --description, --allowed-paths'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.update(id, updates);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}
