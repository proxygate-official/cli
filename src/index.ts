#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerGettingStartedCommand } from './commands/getting-started.js';
import { registerBalanceCommand } from './commands/balance.js';
import { registerPricingCommand } from './commands/pricing.js';
import { registerUsageCommand } from './commands/usage.js';
import { registerProxyCommand } from './commands/proxy.js';
import { registerDepositCommand } from './commands/deposit.js';
import { registerWithdrawCommand } from './commands/withdraw.js';
import { registerWithdrawConfirmCommand } from './commands/withdraw-confirm.js';
import { registerListingsCommand } from './commands/listings.js';

const program = new Command('proxygate');

program
  .version('0.1.0')
  .description(
    'ProxyGate CLI — the Airbnb for API capacity.\n\n' +
      'Buy access to AI APIs with USDC on Solana. Sellers list unused quota,\n' +
      'agents purchase access through a transparent proxy. Keys never leave the server.',
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
      '  $ proxygate proxy <id> <path> -d \'{"model":"gpt-4",...}\'\n' +
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

program.parse();
