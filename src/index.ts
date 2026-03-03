#!/usr/bin/env node

import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerBalanceCommand } from './commands/balance.js';
import { registerPricingCommand } from './commands/pricing.js';
import { registerUsageCommand } from './commands/usage.js';
import { registerProxyCommand } from './commands/proxy.js';
import { registerDepositCommand } from './commands/deposit.js';
import { registerWithdrawCommand } from './commands/withdraw.js';
import { registerWithdrawConfirmCommand } from './commands/withdraw-confirm.js';

const program = new Command('proxygate');

program
  .version('0.1.0')
  .description('ProxyGate CLI -- interact with the ProxyGate API marketplace')
  .option('--gateway <url>', 'Override gateway URL from config')
  .option('--keypair <path>', 'Override keypair path from config')
  .option('--json', 'Output raw JSON instead of formatted text');

registerInitCommand(program);
registerBalanceCommand(program);
registerPricingCommand(program);
registerUsageCommand(program);
registerProxyCommand(program);
registerDepositCommand(program);
registerWithdrawCommand(program);
registerWithdrawConfirmCommand(program);

program.parse();
