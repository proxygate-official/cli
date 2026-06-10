import type { Command } from 'commander';
import { getClient } from '../helpers.js';
import { green, red } from '../format.js';
import { handleError } from '../errors.js';

export function registerRateCommand(program: Command): void {
  program
    .command('rate')
    .description('Rate a seller after a proxy request')
    .requiredOption('--request-id <id>', 'Request ID from the proxy response receipt')
    .option('--up', 'Positive rating (thumbs up)')
    .option('--down', 'Negative rating (thumbs down)')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate rate --request-id abc-123 --up\n' +
        '  $ proxygate rate --request-id abc-123 --down\n\n' +
        'The request ID is shown after each proxy call (e.g., "request: abc12345").\n' +
        'You can also find it in `proxygate usage --json` under each entry\'s `id` field.',
    )
    .action(async (opts: { requestId: string; up?: boolean; down?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        if (!opts.up && !opts.down) {
          console.error(red('Error: specify --up or --down'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        const result = await client.rate({
          request_id: opts.requestId,
          is_positive: !!opts.up,
        });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const emoji = opts.up ? green('👍') : red('👎');
        const verb = result.is_update ? 'Updated' : 'Submitted';
        console.log(`${emoji} Rating ${verb.toLowerCase()}: ${opts.up ? 'positive' : 'negative'}`);
      } catch (err) {
        handleError(err);
      }
    });
}
