import type { Command } from 'commander';
import { registerListSubcommand } from './list.js';
import { registerCreateSubcommand } from './create.js';
import { registerUpdateSubcommand } from './update.js';
import { registerPauseSubcommand, registerUnpauseSubcommand } from './pause-unpause.js';
import { registerDeleteSubcommand } from './delete.js';
import { registerRotateKeySubcommand } from './rotate-key.js';
import { registerDocsSubcommand } from './docs.js';
import { registerUploadDocsSubcommand } from './upload-docs.js';
import { registerHeadersSubcommand } from './headers.js';

/**
 * Register the `proxygate listings` command group.
 *
 * Provides 10 subcommands for seller listing management:
 * list, create, update, pause, unpause, delete, rotate-key, docs, upload-docs, headers.
 *
 * JSON output by default; use --table for human-readable output.
 */
export function registerListingsCommand(program: Command): void {
  const listings = program
    .command('listings')
    .description('Manage your seller listings (create, update, pause, delete, rotate keys)')
    .addHelpText(
      'after',
      '\nSubcommands:\n' +
        '  list                         List your seller listings\n' +
        '  create                       Create a new listing (interactive)\n' +
        '  update <id>                  Update a listing\n' +
        '  pause <id>                   Pause a listing\n' +
        '  unpause <id>                 Unpause a listing\n' +
        '  delete <id>                  Delete a listing\n' +
        '  rotate-key <id>              Rotate API key or OAuth2 credentials\n' +
        '  docs <id>                    View API documentation for a listing\n' +
        '  upload-docs <id> <file>      Upload OpenAPI or markdown docs for a listing\n' +
        '  headers <id>                 Manage upstream headers\n\n' +
        'Examples:\n' +
        '  $ proxygate listings list                  JSON output (default)\n' +
        '  $ proxygate listings list --table          Table format\n' +
        '  $ proxygate listings create                Interactive mode\n' +
        '  $ proxygate listings create --non-interactive --service-name my-api ...\n',
    );

  registerListSubcommand(listings, program);
  registerCreateSubcommand(listings, program);
  registerUpdateSubcommand(listings, program);
  registerPauseSubcommand(listings, program);
  registerUnpauseSubcommand(listings, program);
  registerDeleteSubcommand(listings, program);
  registerRotateKeySubcommand(listings, program);
  registerDocsSubcommand(listings, program);
  registerUploadDocsSubcommand(listings, program);
  registerHeadersSubcommand(listings, program);
}
