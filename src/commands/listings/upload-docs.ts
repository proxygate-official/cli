import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { green, red } from '../../format.js';
import { handleError } from './helpers.js';

function detectDocType(filePath: string): 'openapi' | 'markdown' {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  return 'openapi';
}

/** Register the `listings upload-docs` subcommand. */
export function registerUploadDocsSubcommand(listings: Command, program: Command): void {
  listings
    .command('upload-docs <id> <file>')
    .description('Upload OpenAPI spec (.yaml/.json) or markdown (.md) documentation for a listing')
    .option('--type <type>', 'Force doc type: openapi or markdown (auto-detected from extension)')
    .action(async (id: string, file: string, opts: { type?: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const content = await readFile(file, 'utf-8');
        const docType = (opts.type as 'openapi' | 'markdown') ?? detectDocType(file);

        if (docType !== 'openapi' && docType !== 'markdown') {
          console.error(red('Error: --type must be "openapi" or "markdown"'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.uploadDocs(id, { doc_type: docType, content });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(green(`Documentation uploaded (${result.doc_type}) for listing ${result.listing_id}`));
        }
      } catch (err) {
        handleError(err);
      }
    });
}
