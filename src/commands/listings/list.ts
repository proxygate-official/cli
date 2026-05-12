import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { bold, cyan, green, yellow, dim, formatTable } from '../../format.js';
import { handleError } from './helpers.js';

/** Register the `listings list` subcommand. */
export function registerListSubcommand(listings: Command, program: Command): void {
  listings
    .command('list')
    .description('List all your seller listings')
    .option('--table', 'Display in human-readable table format')
    .action(async (opts: { table?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.listings.list();

        if (opts.table) {
          if (result.listings.length === 0) {
            console.log(dim('No listings found. Create one with: proxygate listings create'));
            return;
          }

          console.log(bold(`Seller Listings (${result.listings.length})`));
          console.log();

          // Phase 51-09: prefer slug as primary identifier, fall back to
          // truncated UUID for listings created before the 51-01 backfill.
          // Phase 51.5: render FREE for procured listings (free_listing_approved=true).
          const headers = ['ID', 'Service', 'Status', 'RPM', 'Price', 'Shield'];
          const rows = result.listings.map((l) => [
            l.slug ?? l.id.slice(0, 8),
            l.service_catalog?.name ?? 'unknown',
            l.is_active ? green('active') : yellow('paused'),
            `${l.total_rpm - (l.reserved_rpm ?? 0)}/${l.total_rpm}`,
            l.free_listing_approved === true ? bold(cyan('FREE')) : String(l.price_per_request),
            l.shield_enabled ? green('on') : dim('off'),
          ]);
          console.log(formatTable(headers, rows));
          return;
        }

        // JSON output (default)
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}
