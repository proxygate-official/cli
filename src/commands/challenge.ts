import type { Command } from 'commander';
import { getClient } from '../helpers.js';
import { bold, green, yellow, dim } from '../format.js';
import { handleError } from '../errors.js';

interface StatusResponse {
  challenge?: { status?: string; max_participants?: number };
  spots_filled?: number;
  my_application?: {
    status: string;
    pitch: string;
    funded_tx?: string;
  } | null;
}

const APPLY_URL = 'https://proxygate.ai/challenge/apply';

/**
 * Register the `proxygate challenge` command group.
 *
 * Subcommands:
 *   apply   — Opens browser to apply (requires tweet verification)
 *   status  — Check your challenge application status
 */
export function registerChallengeCommand(program: Command): void {
  const challenge = program
    .command('challenge')
    .description('$1 Agent Challenge commands');

  challenge
    .command('apply')
    .description('Apply for the $1 Agent Challenge (opens browser)')
    .action(async () => {
      console.log(`\n  Opening ${bold(APPLY_URL)} in your browser...\n`);
      console.log(`  ${dim('The application requires email verification, wallet connection,')}`);
      console.log(`  ${dim('and a tweet mentioning @proxygateai — all handled in the web UI.')}\n`);

      const { openBrowser } = await import('../lib/browser.js');
      openBrowser(APPLY_URL);
    });

  challenge
    .command('status')
    .description('Check your challenge application status')
    .option('--challenge <slug>', 'Challenge slug', 'one-dollar-001')
    .action(async (opts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const { authenticatedRequest } = client._vaultDelegate();

        const res = await authenticatedRequest<StatusResponse>('GET', '/v1/challenge/status', {
          query: { slug: opts.challenge },
        });

        if (parentOpts.json) {
          console.log(JSON.stringify(res, null, 2));
          return;
        }

        console.log(bold('\n  $1 Agent Challenge'));
        console.log(`  ${dim('Status:')} ${res.challenge?.status ?? 'unknown'}`);
        console.log(`  ${dim('Spots:')}  ${res.spots_filled ?? '?'}/${res.challenge?.max_participants ?? '?'}`);

        if (res.my_application) {
          console.log();
          console.log(`  ${green('Your application:')}`);
          console.log(`    Status: ${res.my_application.status}`);
          console.log(`    Pitch:  ${res.my_application.pitch}`);
          if (res.my_application.funded_tx) {
            console.log(`    Funded: ${dim(res.my_application.funded_tx)}`);
          }
        } else {
          console.log();
          console.log(`  ${dim('Not applied yet.')} Run: ${bold('proxygate challenge apply')}`);
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
