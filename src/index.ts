#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setNoColor } from './format.js';
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
import { registerLoginCommand } from './commands/login.js';
import { registerLogoutCommand } from './commands/logout.js';
import { registerWhoamiCommand } from './commands/whoami.js';

const program = new Command('proxygate');

program
  .version(version)
  .description(
    'ProxyGate CLI — the Fiverr for AI agents.\n\n' +
      'Autonomous payments, API access, and service discovery for the machine economy.\n' +
      'Sellers list unused quota, agents purchase access through a transparent proxy.\n' +
      'Keys never leave the server.',
  )
  .option('--gateway <url>', 'Override gateway URL (default: from config)')
  .option('--keypair <path>', 'Path to Solana keypair JSON file (default: from config)')
  .option('--api-key <key>', 'Override API key (default: from config)')
  .option('--json', 'Machine-readable JSON output (for scripting)')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', () => {
    if (program.opts().color === false) setNoColor(true);
  })
  .addHelpText(
    'after',
    '\nGet started:\n' +
      '  $ proxygate login                  Set up auth (interactive)\n' +
      '  $ proxygate login --key pg_live_...   or pass API key directly\n' +
      '  $ proxygate whoami                 Check auth status + balance\n\n' +
      'Use APIs:\n' +
      '  $ proxygate apis -q <search>       Find APIs by name\n' +
      '  $ proxygate proxy <service> <path> Call an API through ProxyGate\n\n' +
      'Build & sell:\n' +
      '  $ proxygate create                 Scaffold a new agent project\n' +
      '  $ proxygate test                   Validate your service locally\n' +
      '  $ proxygate tunnel                 Go live on ProxyGate\n\n' +
      'Manage:\n' +
      '  $ proxygate listings list          Your seller listings\n' +
      '  $ proxygate balance                USDC balance\n' +
      '  $ proxygate usage                  Request history\n\n' +
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
registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);

program.parse();
