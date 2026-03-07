import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { bold, dim, red } from '../../format.js';
import { handleError } from './helpers.js';

/** Register the `listings headers` subcommand group. */
export function registerHeadersSubcommand(listings: Command, program: Command): void {
  const headers = listings
    .command('headers <listing-id>')
    .description('Manage upstream headers for a listing');

  headers
    .command('list')
    .description('List upstream headers')
    .action(async () => {
      const listingId = headers.args[0];
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const listing = await client.listings.get(listingId);
        const entries = Object.entries(listing.upstream_headers ?? {});
        if (parentOpts.json) {
          console.log(JSON.stringify({ upstream_headers: Object.fromEntries(entries) }, null, 2));
        } else if (entries.length === 0) {
          console.log(dim('No upstream headers configured.'));
        } else {
          console.log(bold('Upstream Headers:'));
          for (const [name, value] of entries) {
            console.log(`  ${bold(name)}: ${value}`);
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  headers
    .command('set <name> <value>')
    .description('Set an upstream header (template vars: {{wallet}}, {{listing_id}}, {{request_id}}, {{service}})')
    .action(async (name: string, value: string) => {
      const listingId = headers.args[0];
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const listing = await client.listings.get(listingId);
        const current = listing.upstream_headers ?? {};
        const updated = { ...current, [name]: value };
        await client.listings.update(listingId, { upstream_headers: updated });
        console.log(`${bold('Set')} ${name}: ${value}`);
      } catch (err) {
        handleError(err);
      }
    });

  headers
    .command('unset <name>')
    .description('Remove an upstream header')
    .action(async (name: string) => {
      const listingId = headers.args[0];
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const listing = await client.listings.get(listingId);
        const current = listing.upstream_headers ?? {};
        if (!(name in current)) {
          console.error(red(`Header "${name}" not found`));
          process.exit(1);
        }
        const updated = { ...current };
        delete updated[name];
        await client.listings.update(listingId, { upstream_headers: updated });
        console.log(`${bold('Removed')} ${name}`);
      } catch (err) {
        handleError(err);
      }
    });
}
