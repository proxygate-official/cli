import type { Command } from 'commander';
import { getClient } from '../helpers.js';
import { green, red, dim } from '../format.js';
import { handleError } from '../errors.js';

/**
 * Register the `proxygate verify-email` command.
 *
 * Confirms a contact email previously submitted via `proxygate init --email`
 * (or the SDK `setContactEmail`) using the one-time token from the email.
 *
 * On a collision (the email is already bound to another identity) the gateway
 * returns a `verification_required` / `email_conflict` error carrying an
 * action/docs pointer to the web-claim flow. `handleError` surfaces it.
 */
export function registerVerifyEmailCommand(program: Command): void {
  program
    .command('verify-email')
    .description('Confirm your contact email with the one-time token from the email')
    .requiredOption('--token <token>', 'Verification token from the email')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate verify-email --token abc123\n' +
        '  $ proxygate verify-email --token abc123 --json\n\n' +
        'Submit your email first with `proxygate init --email you@example.com`.\n' +
        'If the email is already linked to another account, this prints how to\n' +
        'claim it from the web (sign in with the original method, link your wallet).',
    )
    .action(async (opts: { token: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; apiKey?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const result = await client.verifyContactEmail({ token: opts.token });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.verified) {
          console.log(`${green('Email verified.')} status: ${result.status}`);
        } else {
          console.log(`${red('Email not verified.')} status: ${result.status}`);
          if (result.status === 'expired') {
            console.log(dim('Token expired. Re-submit with `proxygate init --email <email>`.'));
          } else if (result.status === 'already_used') {
            console.log(dim('This token was already used.'));
          }
          process.exit(1);
        }
      } catch (err) {
        // Collision (verification_required / email_conflict) is surfaced by
        // handleError via err.action / err.docs — not swallowed, not crashed.
        handleError(err);
      }
    });
}
