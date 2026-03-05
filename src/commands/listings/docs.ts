import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { bold, dim, formatTable } from '../../format.js';
import { truncate, handleError } from './helpers.js';

/** Register the `listings docs` subcommand. */
export function registerDocsSubcommand(listings: Command, program: Command): void {
  listings
    .command('docs <id>')
    .description('View API documentation for a listing')
    .option('--raw', 'Output raw content (OpenAPI spec or markdown)')
    .action(async (id: string, opts: { raw?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const docs = await client.docs(id);

        if (!docs) {
          console.log(dim('No documentation found for this listing.'));
          return;
        }

        if (opts.raw) {
          console.log(docs.content);
          return;
        }

        // Structured output
        console.log(bold(`Documentation (${docs.doc_type})`));
        console.log(dim(`Listing: ${docs.listing_id}`));
        console.log(dim(`Updated: ${docs.updated_at}`));
        console.log();

        if (docs.doc_type === 'openapi' && docs.parsed_endpoints) {
          console.log(bold('Endpoints:'));
          console.log();
          const headers = ['Method', 'Path', 'Summary'];
          const rows = (docs.parsed_endpoints as Array<{ method?: string; path?: string; summary?: string }>).map((ep) => [
            ep.method ?? '',
            ep.path ?? '',
            truncate(ep.summary ?? '', 50),
          ]);
          console.log(formatTable(headers, rows));
        } else {
          console.log(docs.content);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
