import type { Command } from 'commander';

/**
 * Lazy command registry.
 *
 * Each entry maps a top-level command name to a description (cheap, static —
 * no module import) and a `load()` that dynamically imports the command's
 * module only when that command is actually invoked.
 *
 * This is the core of Phase 60 Opt #1: a `proxygate proxy` call no longer
 * pulls in `@walletconnect/sign-client` (tunnel), `@inquirer/prompts`
 * (login/init), `qrcode` (tunnel) or `js-yaml` (test) just to parse argv.
 *
 * `describe` strings are intentionally duplicated from each command's
 * `.description(...)`. They drive `proxygate --help` without importing any
 * command module. Full per-command help still loads the real module (so the
 * real description, args and options are authoritative when you run
 * `proxygate <cmd> --help`).
 */
export interface LazyCommand {
  readonly name: string;
  readonly describe: string;
  readonly load: () => Promise<(program: Command) => void>;
  /** Command aliases (e.g. `apis` is also reachable as `search`). */
  readonly aliases?: readonly string[];
  /** Deprecated/internal commands hidden from `proxygate --help`. */
  readonly hidden?: boolean;
}

export const LAZY_COMMANDS: readonly LazyCommand[] = [
  {
    name: 'init',
    describe: 'Initialize Proxygate (use `proxygate login` instead)',
    hidden: true,
    load: () => import('./commands/init.js').then((m) => m.registerInitCommand),
  },
  {
    name: 'getting-started',
    describe: 'Interactive setup guide (use `proxygate login` instead)',
    hidden: true,
    load: () =>
      import('./commands/getting-started.js').then((m) => m.registerGettingStartedCommand),
  },
  {
    name: 'balance',
    describe: 'Show your USDC vault balance (total, available, pending, cooldown)',
    load: () => import('./commands/balance.js').then((m) => m.registerBalanceCommand),
  },
  {
    name: 'pricing',
    describe: 'Browse available APIs, sellers, and pricing (no auth required)',
    load: () => import('./commands/pricing.js').then((m) => m.registerPricingCommand),
  },
  {
    name: 'usage',
    describe: 'View your API usage history with per-service summaries',
    load: () => import('./commands/usage.js').then((m) => m.registerUsageCommand),
  },
  {
    name: 'proxy',
    describe: 'Send a proxied request to an upstream API through a seller listing',
    load: () => import('./commands/proxy.js').then((m) => m.registerProxyCommand),
  },
  {
    name: 'deposit',
    describe: 'Deposit USDC from your Solana wallet into your Proxygate vault',
    load: () => import('./commands/deposit.js').then((m) => m.registerDepositCommand),
  },
  {
    name: 'withdraw',
    describe: 'Withdraw USDC from your vault back to your Solana wallet',
    load: () => import('./commands/withdraw.js').then((m) => m.registerWithdrawCommand),
  },
  {
    name: 'withdraw-confirm',
    describe: 'Confirm an on-chain withdrawal with the gateway (recovery tool)',
    load: () =>
      import('./commands/withdraw-confirm.js').then((m) => m.registerWithdrawConfirmCommand),
  },
  {
    name: 'listings',
    describe: 'Manage your seller listings (create, update, pause, delete, rotate keys)',
    load: () => import('./commands/listings.js').then((m) => m.registerListingsCommand),
  },
  {
    name: 'tunnel',
    describe: 'Expose local services to Proxygate via a reverse tunnel',
    load: () => import('./commands/tunnel.js').then((m) => m.registerTunnelCommand),
  },
  {
    name: 'settlements',
    describe: 'View settlement history (buyer spend or seller earnings)',
    load: () => import('./commands/settlements.js').then((m) => m.registerSettlementsCommand),
  },
  {
    name: 'apis',
    describe: 'Browse and search available API listings (no auth required)',
    aliases: ['search'],
    load: () => import('./commands/apis.js').then((m) => m.registerApisCommand),
  },
  {
    name: 'services',
    describe: 'View aggregated service stats (no auth required)',
    load: () => import('./commands/services.js').then((m) => m.registerServicesCommand),
  },
  {
    name: 'categories',
    describe: 'List API categories (no auth required)',
    load: () => import('./commands/categories.js').then((m) => m.registerCategoriesCommand),
  },
  {
    name: 'rate',
    describe: 'Rate a seller after a proxy request',
    load: () => import('./commands/rate.js').then((m) => m.registerRateCommand),
  },
  {
    name: 'create',
    describe: 'Scaffold a new Proxygate agent project',
    load: () => import('./commands/create.js').then((m) => m.registerCreateCommand),
  },
  {
    name: 'test',
    describe: 'Test local services defined in proxygate.tunnel.yaml',
    load: () => import('./commands/test-service.js').then((m) => m.registerTestCommand),
  },
  {
    name: 'dev',
    describe: 'Start tunnel in dev mode with verbose logging and config watching',
    load: () => import('./commands/dev.js').then((m) => m.registerDevCommand),
  },
  {
    name: 'skills',
    describe: 'Manage agent skills for Proxygate',
    load: () => import('./commands/skills.js').then((m) => m.registerSkillsCommand),
  },
  {
    name: 'metadata',
    describe: 'Machine-readable project metadata (for AI agents and tooling)',
    load: () => import('./commands/metadata.js').then((m) => m.registerMetadataCommand),
  },
  {
    name: 'commands',
    describe: 'Machine-readable command catalog with args, types, and schemas',
    load: () =>
      import('./commands/commands-meta.js').then((m) => m.registerCommandsMetaCommand),
  },
  {
    name: 'challenge',
    describe: '$1 Agent Challenge commands',
    load: () => import('./commands/challenge.js').then((m) => m.registerChallengeCommand),
  },
  {
    name: 'login',
    describe: 'Authenticate with API key or wallet keypair',
    load: () => import('./commands/login.js').then((m) => m.registerLoginCommand),
  },
  {
    name: 'logout',
    describe: 'Remove auth credentials from config',
    load: () => import('./commands/logout.js').then((m) => m.registerLogoutCommand),
  },
  {
    name: 'whoami',
    describe: 'Show current auth status and configuration',
    load: () => import('./commands/whoami.js').then((m) => m.registerWhoamiCommand),
  },
];

/**
 * Resolve the invoked top-level command from argv.
 *
 * Skips global option tokens (and the values of value-taking globals) so
 * `proxygate --json proxy ...` and `proxygate --gateway X proxy ...` still
 * resolve to `proxy`. Returns `undefined` for no-command / help / version,
 * in which case the caller registers description-only stubs for all commands.
 */
/** Find a command by its name or any of its aliases (e.g. `search` → `apis`). */
export function findLazyCommand(token: string | undefined): LazyCommand | undefined {
  if (token === undefined) return undefined;
  return LAZY_COMMANDS.find(
    (c) => c.name === token || (c.aliases?.includes(token) ?? false),
  );
}

export function resolveInvokedCommand(argv: readonly string[]): string | undefined {
  const valueOpts = new Set(['--gateway', '--keypair', '--api-key']);
  for (let i = 2; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === undefined) break;
    if (tok.startsWith('-')) {
      if (valueOpts.has(tok)) i += 1; // also skip this option's value
      continue;
    }
    return tok;
  }
  return undefined;
}
