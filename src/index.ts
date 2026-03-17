#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { registerInitCommand } from './commands/init.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };
import { registerGettingStartedCommand } from './commands/getting-started.js';
import { registerBalanceCommand } from './commands/balance.js';
import { registerPricingCommand } from './commands/pricing.js';
import { registerUsageCommand } from './commands/usage.js';
import { registerProxyCommand } from './commands/proxy.js';
import { registerDepositCommand } from './commands/deposit.js';
import { registerWithdrawCommand } from './commands/withdraw.js';
import { registerWithdrawConfirmCommand } from './commands/withdraw-confirm.js';
import { registerListingsCommand } from './commands/listings.js';
import { registerTunnelCommand } from './commands/tunnel.js';
import { registerSettlementsCommand } from './commands/settlements.js';
import { registerApisCommand } from './commands/apis.js';
import { registerServicesCommand } from './commands/services.js';
import { registerCategoriesCommand } from './commands/categories.js';
import { registerRateCommand } from './commands/rate.js';
import { registerJobsCommand } from './commands/jobs.js';
import { registerCreateCommand } from './commands/create.js';
import { registerTestCommand } from './commands/test-service.js';
import { registerDevCommand } from './commands/dev.js';
import { registerSkillsCommand } from './commands/skills.js';
import { registerMetadataCommand } from './commands/metadata.js';
import { registerCommandsMetaCommand } from './commands/commands-meta.js';

const program = new Command('proxygate');

program
  .version(version)
  .description(
    'ProxyGate CLI — the Stripe for AI agents.\n\n' +
      'Autonomous payments, API access, and service discovery for the machine economy.\n' +
      'Sellers list unused quota, agents purchase access through a transparent proxy.\n' +
      'Keys never leave the server.',
  )
  .option('--gateway <url>', 'Override gateway URL (default: from config)')
  .option('--keypair <path>', 'Path to Solana keypair JSON file (default: from config)')
  .option('--json', 'Machine-readable JSON output (for scripting)')
  .addHelpText(
    'after',
    '\nQuick start:\n' +
      '  $ proxygate getting-started        First time? Start here\n' +
      '  $ proxygate pricing                Browse available APIs\n' +
      '  $ proxygate balance                Check your USDC balance\n' +
      '  $ proxygate proxy <id> <path> -d \'{"model":"gpt-4",...}\'\n\n' +
      'Build & sell an agent:\n' +
      '  $ proxygate create                 Scaffold a new agent project\n' +
      '  $ proxygate test                   Validate your service locally\n' +
      '  $ proxygate tunnel                 Go live on ProxyGate\n\n' +
      'Manage listings:\n' +
      '  $ proxygate listings list           List your seller listings\n' +
      '  $ proxygate listings create         Create a new listing (interactive)\n\n' +
      'Config: ~/.proxygate/config.json\n' +
      'Docs:   https://gateway.proxygate.ai/docs',
  );

registerInitCommand(program);
registerGettingStartedCommand(program);
registerBalanceCommand(program);
registerPricingCommand(program);
registerUsageCommand(program);
registerProxyCommand(program);
registerDepositCommand(program);
registerWithdrawCommand(program);
registerWithdrawConfirmCommand(program);
registerListingsCommand(program);
registerTunnelCommand(program);
registerSettlementsCommand(program);
registerApisCommand(program);
registerServicesCommand(program);
registerCategoriesCommand(program);
registerRateCommand(program);
registerJobsCommand(program);
registerCreateCommand(program);
registerTestCommand(program);
registerDevCommand(program);
registerSkillsCommand(program);
registerMetadataCommand(program);
registerCommandsMetaCommand(program);

program.parse();
