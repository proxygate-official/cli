import type { Command } from 'commander';
import { bold, dim } from '../format.js';
import {
  findKeypair,
  connectGateway,
  checkBalance,
  showApis,
  showNextSteps,
} from './getting-started-steps.js';

const DEFAULT_GATEWAY = 'https://gateway.proxygate.ai';

/**
 * Register the `proxygate getting-started` command.
 *
 * Interactive walkthrough that checks keypair, configures the CLI,
 * tests gateway connectivity, and shows available APIs.
 */
export function registerGettingStartedCommand(program: Command): void {
  program
    .command('getting-started', { hidden: true })
    .description('Interactive setup guide (use `proxygate login` instead)')
    .option('--gateway <url>', 'Gateway URL', DEFAULT_GATEWAY)
    .option('--keypair <path>', 'Path to Solana keypair JSON file')
    .addHelpText(
      'after',
      '\nThis command walks you through:\n' +
        '  1. Finding or creating a Solana keypair\n' +
        '  2. Configuring the CLI\n' +
        '  3. Testing gateway connectivity\n' +
        '  4. Checking your balance\n' +
        '  5. Browsing available APIs\n' +
        '  6. Showing next steps',
    )
    .action(async (opts: { gateway: string; keypair?: string }) => {
      console.log();
      console.log(bold('Welcome to Proxygate'));
      console.log(dim('The Fiverr for AI agents — autonomous payments, API access, and service discovery.'));
      console.log();

      // Step 1: Find keypair
      const keypairPath = await findKeypair(opts.keypair);
      if (!keypairPath) return;

      // Step 2: Connect to gateway
      const client = await connectGateway(opts.gateway, keypairPath);
      if (!client) return;

      // Step 3: Check balance
      const hasBalance = await checkBalance(client, opts.gateway);

      // Step 4: Show available APIs
      await showApis(client);

      // Step 5: Next steps
      showNextSteps(hasBalance);
    });
}
