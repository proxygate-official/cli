import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { bold, dim, red } from '../../format.js';
import { handleError } from './helpers.js';

/**
 * Register the `listings headers` subcommand group.
 *
 * Usage:
 *   proxygate listings headers list <listing-id>
 *   proxygate listings headers set <listing-id> <name> <value>
 *   proxygate listings headers unset <listing-id> <name>
 *
 * Each leaf subcommand declares its own positional arguments so commander
 * can dispatch cleanly. The previous implementation attached a positional
 * arg to the parent `headers <listing-id>` AND added `list`/`set`/`unset`
 * subcommands underneath, which commander cannot parse unambiguously and
 * caused "unknown command" errors in practice.
 */
export function registerHeadersSubcommand(listings: Command, program: Command): void {
  const headers = listings
    .command('headers')
    .description('Manage upstream headers for a listing');

  headers
    .command('list <listing-id>')
    .description('List upstream headers')
    .action(async (listingId: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const listing = await client.listings.get(listingId);
        const current = (listing.upstream_headers ?? null) as Record<string, string> | null;
        if (current === null) {
          // Gateway response does not include upstream_headers at all.
          // Treat as empty for display, and warn the user that the field
          // was not returned so they know why the list is empty.
          if (parentOpts.json) {
            console.log(JSON.stringify({ upstream_headers: {} }, null, 2));
          } else {
            console.log(dim('No upstream headers configured.'));
          }
          return;
        }
        const entries = Object.entries(current);
        if (parentOpts.json) {
          console.log(JSON.stringify({ upstream_headers: current }, null, 2));
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
    .command('set <listing-id> <name> <value>')
    .description('Set an upstream header (template vars: {{wallet}}, {{listing_id}}, {{request_id}}, {{service}})')
    .action(async (listingId: string, name: string, value: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const listing = await client.listings.get(listingId);
        // Fail closed if the gateway does not return the current headers.
        // Merging into an assumed-empty object would silently wipe every
        // other header on the listing when we PATCH below.
        if (listing.upstream_headers === undefined) {
          console.error(
            red('Cannot set header: gateway did not return current upstream_headers. ') +
              'Refusing to write to avoid clobbering existing headers.',
          );
          process.exit(1);
        }
        const current = listing.upstream_headers as Record<string, string>;
        const updated = { ...current, [name]: value };
        await client.listings.update(listingId, { upstream_headers: updated });
        console.log(`${bold('Set')} ${name}: ${value}`);
      } catch (err) {
        handleError(err);
      }
    });

  headers
    .command('unset <listing-id> <name>')
    .description('Remove an upstream header')
    .action(async (listingId: string, name: string) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();
      try {
        const client = await getClient(parentOpts);
        const listing = await client.listings.get(listingId);
        if (listing.upstream_headers === undefined) {
          console.error(
            red('Cannot unset header: gateway did not return current upstream_headers. ') +
              'Refusing to write to avoid clobbering existing headers.',
          );
          process.exit(1);
        }
        const current = listing.upstream_headers as Record<string, string>;
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
