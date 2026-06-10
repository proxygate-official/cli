import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { green, red, dim } from '../../format.js';
import { handleError, printTestResults } from './helpers.js';

type DocType = 'openapi' | 'markdown' | 'graphql';

function detectDocType(filePath: string): DocType {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.graphql' || ext === '.gql') return 'graphql';
  return 'openapi';
}

/** Register the `listings upload-docs` subcommand. */
export function registerUploadDocsSubcommand(listings: Command, program: Command): void {
  listings
    .command('upload-docs <id> <file>')
    .description('Upload OpenAPI (.yaml/.json), GraphQL schema (.graphql/.gql or introspection JSON), or markdown (.md) docs for a listing')
    .option('--type <type>', 'Force doc type: openapi, graphql, or markdown (auto-detected from extension). Use --type graphql for an introspection .json file.')
    .action(async (id: string, file: string, opts: { type?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const content = await readFile(file, 'utf-8');
        const docType = (opts.type as DocType) ?? detectDocType(file);

        if (docType !== 'openapi' && docType !== 'markdown' && docType !== 'graphql') {
          console.error(red('Error: --type must be "openapi", "graphql", or "markdown"'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.uploadDocs(id, { doc_type: docType, content });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(green(`Documentation uploaded (${result.doc_type}) for listing ${result.listing_id}`));
          if (result.endpoints_parsed > 0) {
            console.log(dim(`${result.endpoints_parsed} endpoint(s) parsed from spec`));
          }
          if (result.test_results) {
            printTestResults(result);
            if (result.message) console.log(result.message);
            if (result.test_passed === false) {
              console.error(red('Listing remains inactive. Fix failing endpoints and re-upload.'));
              process.exit(1);
            }
          }
        }
      } catch (err) {
        handleError(err);
      }
    });
}
