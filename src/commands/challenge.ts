import type { Command } from 'commander';
import { getClient } from '../helpers.js';
import { bold, green, yellow, dim } from '../format.js';
import { handleError } from '../errors.js';

/**
 * Register the `proxygate challenge` command group.
 *
 * Subcommands:
 *   apply   — Apply for the $1 Agent Challenge
 *   status  — Check your challenge application status
 */
export function registerChallengeCommand(program: Command): void {
  const challenge = program
    .command('challenge')
    .description('$1 Agent Challenge commands');

  challenge
    .command('apply')
    .description('Apply for the $1 Agent Challenge')
    .requiredOption('--pitch <text>', 'What will you build? (10-500 chars)')
    .option('--path <type>', 'Participation path: template, custom, existing_service', 'template')
    .option('--challenge <slug>', 'Challenge slug', 'one-dollar-001')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate challenge apply --pitch "Translation agent with 50 languages"\n' +
        '  $ proxygate challenge apply --pitch "Weather API" --path existing_service\n' +
        '  $ proxygate challenge apply --pitch "Custom ML pipeline" --path custom',
    )
    .action(async (opts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        if (!['template', 'custom', 'existing_service'].includes(opts.path)) {
          console.error('Invalid --path. Must be: template, custom, or existing_service');
          process.exit(1);
        }

        if (opts.pitch.length < 10 || opts.pitch.length > 500) {
          console.error('--pitch must be 10-500 characters');
          process.exit(1);
        }

        const client = await getClient(parentOpts);

        const res = await client.request('POST', '/v1/challenge/apply', {
          challenge_slug: opts.challenge,
          pitch: opts.pitch,
          participation_path: opts.path,
        });

        if (parentOpts.json) {
          console.log(JSON.stringify(res, null, 2));
          return;
        }

        if (res.error) {
          console.error(`\n  ${bold('Application failed:')} ${res.error}`);
          console.error();
          console.error('  Pre-requirements:');
          console.error(`    1. Verified email  ${dim('→ proxygate.ai/challenge/apply')}`);
          console.error(`    2. Verified tweet  ${dim('→ proxygate.ai/referral')}`);
          process.exit(1);
        }

        if (res.status === 'waitlisted') {
          console.log(`\n  ${yellow('Waitlisted!')} We'll notify you if a spot opens.`);
        } else {
          console.log(`\n  ${green('Application submitted!')} We'll review within 24 hours.`);
        }
        console.log(`  Application ID: ${dim(res.application_id)}`);
      } catch (err) {
        handleError(err);
      }
    });

  challenge
    .command('status')
    .description('Check your challenge application status')
    .option('--challenge <slug>', 'Challenge slug', 'one-dollar-001')
    .action(async (opts) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);

        const res = await client.request('GET', `/v1/challenge/status?slug=${opts.challenge}`);

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
          console.log(`  ${dim('Not applied yet.')} Run: proxygate challenge apply --pitch "..."`)
        }
        console.log();
      } catch (err) {
        handleError(err);
      }
    });
}
