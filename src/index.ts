#!/usr/bin/env node

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { setNoColor } from './format.js';
import { LAZY_COMMANDS, resolveInvokedCommand, findLazyCommand } from './lazy-commands.js';
import { loadConfig } from './config.js';
import { registerGlobalOptions } from './global-options.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command('proxygate');

program
  .version(version)
  .description(
    'Proxygate CLI — the agentic commerce marketplace for AI agents.\n\n' +
      'Autonomous payments, API access, and service discovery for the machine economy.\n' +
      'Sellers list unused quota, agents purchase access through a transparent proxy.\n' +
      'Keys never leave the server.',
  );

registerGlobalOptions(program);

program
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
      '  $ proxygate proxy <service> <path> Call an API through Proxygate\n\n' +
      'Build & sell:\n' +
      '  $ proxygate create                 Scaffold a new agent project\n' +
      '  $ proxygate test                   Validate your service locally\n' +
      '  $ proxygate tunnel                 Go live on Proxygate\n\n' +
      'Manage:\n' +
      '  $ proxygate listings list          Your seller listings\n' +
      '  $ proxygate balance                USDC balance\n' +
      '  $ proxygate usage                  Request history\n\n' +
      'Config: ~/.proxygate/config.json\n' +
      'Docs:   https://gateway.proxygate.ai/docs',
  );

// Lazy command loading (Phase 60 Opt #1).
//
// Only the invoked command's module is dynamically imported. All other
// commands are registered as description-only stubs so `proxygate --help`,
// version, and unknown-command suggestions still list the full surface
// without importing 30 modules + their dependency trees on every call.
//
// Invariant: if a real command is invoked, `resolveInvokedCommand` returns
// its name and `LAZY_COMMANDS.find` matches it — so a stub is never the
// active command and never needs an action. Stubs are reached only for
// no-command / --help / --version / unknown-command paths.
const invoked = resolveInvokedCommand(process.argv);
const match = findLazyCommand(invoked);

// P6 seller gate: seller-only commands (listings, tunnel) are hidden from
// --help until the cached seller_status (set at login from GET /v1/me) is
// applicant/accepted. Old configs without the field keep the full surface.
// The gateway enforces the real rules; this is presentation only.
const cliConfig = await loadConfig();
const sellerCommandsHidden = cliConfig?.sellerStatus === 'none';

// Description-only stub. Preserves `--help` listing + unknown-command
// suggestions + hidden-command parity (init/getting-started) without
// importing the command's module. Stubs never execute (see invariant above).
const stub = (c: (typeof LAZY_COMMANDS)[number]): void => {
  const cmd = program
    .command(c.name, { hidden: (c.hidden ?? false) || (c.sellerOnly === true && sellerCommandsHidden) })
    .description(c.describe);
  if (c.aliases && c.aliases.length > 0) cmd.aliases([...c.aliases]);
};

if (match) {
  if (match.sellerOnly && sellerCommandsHidden) {
    // Invoked anyway (muscle memory, scripts): friendly CTA instead of the
    // command. The gateway would reject the underlying calls regardless.
    console.error('You are not a seller yet. Apply first: open the dashboard and choose "Become a seller",');
    console.error('then re-run `proxygate login` to refresh your status.');
    process.exit(1);
  }
  const register = await match.load();
  register(program);
  for (const c of LAZY_COMMANDS) {
    if (c.name === match.name) continue;
    stub(c);
  }
} else {
  for (const c of LAZY_COMMANDS) stub(c);
}

await program.parseAsync(process.argv);
