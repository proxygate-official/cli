import type { Command } from 'commander';
import type { WalletLimits } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { bold, green, dim, red, formatUsdc } from '../format.js';
import { handleError } from '../errors.js';

/** Parent flags forwarded to getClient. */
interface ParentOpts {
  gateway?: string;
  keypair?: string;
  apiKey?: string;
  json?: boolean;
}

/**
 * Parse a USDC amount string into micro-USDC, or `null` when the user passes
 * "none" (case-insensitive) to clear the limit. Throws on anything else so the
 * caller can print a clear message and exit without a stack trace.
 */
export function parseUsdcToMicro(value: string): number | null {
  if (value.trim().toLowerCase() === 'none') return null;
  const usdc = Number(value);
  if (!Number.isFinite(usdc) || usdc < 0) {
    throw new Error(`Invalid amount '${value}'. Pass a non-negative USDC number or 'none' to clear.`);
  }
  return Math.round(usdc * 1_000_000);
}

/** Render a single limit value: a USDC amount, or "not set" when null. */
function formatLimit(micro: number | null): string {
  return micro === null ? dim('not set (gateway default applies)') : formatUsdc(micro);
}

/** Print the limits block (human-readable). */
function printLimits(limits: WalletLimits): void {
  console.log(bold('Wallet Spend Limits'));
  console.log();
  console.log(`  ${green('Daily:')}            ${formatLimit(limits.daily_limit_micro_usdc)}`);
  console.log(`  ${green('Per-transaction:')}  ${formatLimit(limits.per_tx_limit_micro_usdc)}`);
}

/**
 * Register the `proxygate limits` command group.
 *
 * `limits get` reads the spend limits of the wallet bound to the API key;
 * `limits set` updates them (USDC in, micro-USDC on the wire). Both require a
 * key carrying the `wallet:limits` scope; a key without it gets a clear message.
 */
export function registerLimitsCommand(program: Command): void {
  const limits = program
    .command('limits')
    .description('View or change your wallet spend limits (daily and per-transaction)')
    .addHelpText(
      'after',
      '\nSubcommands:\n' +
        '  get                          Show current daily and per-transaction limits\n' +
        '  set --daily <usdc> --per-tx <usdc>   Set limits (use "none" to clear one)\n\n' +
        'Examples:\n' +
        '  $ proxygate limits get\n' +
        '  $ proxygate limits set --daily 25 --per-tx 1\n' +
        '  $ proxygate limits set --daily none          # clear the daily limit\n\n' +
        'The wallet limit is the ceiling for all spend on the wallet. The API key\n' +
        'must carry the `wallet:limits` scope to read or change limits.',
    );

  limits
    .command('get')
    .description('Show the current daily and per-transaction spend limits')
    .action(async () => {
      const parentOpts = program.opts<ParentOpts>();
      try {
        const client = await getClient(parentOpts);
        const result = await client.getSpendLimits();
        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        printLimits(result);
      } catch (err) {
        handleError(err);
      }
    });

  limits
    .command('set')
    .description('Set the daily and/or per-transaction spend limit (USDC; "none" clears)')
    .option('--daily <usdc>', 'Daily spend limit in USDC, or "none" to clear')
    .option('--per-tx <usdc>', 'Per-transaction spend limit in USDC, or "none" to clear')
    .action(async (opts: { daily?: string; perTx?: string }) => {
      const parentOpts = program.opts<ParentOpts>();
      try {
        if (opts.daily === undefined && opts.perTx === undefined) {
          console.error(red('Error: pass at least one of --daily or --per-tx.'));
          console.error(dim('Example: proxygate limits set --daily 25 --per-tx 1'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        // Read current limits so an unspecified flag leaves that limit untouched.
        const current = await client.getSpendLimits();

        let daily: number | null;
        let perTx: number | null;
        try {
          daily = opts.daily === undefined ? current.daily_limit_micro_usdc : parseUsdcToMicro(opts.daily);
          perTx = opts.perTx === undefined ? current.per_tx_limit_micro_usdc : parseUsdcToMicro(opts.perTx);
        } catch (parseErr) {
          console.error(red(`Error: ${(parseErr as Error).message}`));
          process.exit(1);
        }

        const result = await client.setSpendLimits({
          daily_limit_micro_usdc: daily,
          per_tx_limit_micro_usdc: perTx,
        });

        if (parentOpts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        console.log(green('Spend limits updated.'));
        console.log();
        printLimits(result);
      } catch (err) {
        handleError(err);
      }
    });
}
