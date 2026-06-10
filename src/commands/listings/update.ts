import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { EndpointPriceOverride } from '@proxygate/sdk';
import { SHIELD_SURCHARGE_DISPLAY } from '@proxygate/sdk';
import { getClient } from '../../helpers.js';
import { red, dim } from '../../format.js';
import { handleError } from './helpers.js';

/** Commander helper for repeatable string options. */
function collectArr(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/**
 * Phase 51.5: parse `--free-endpoint` and `--endpoint-price` flags into a single
 * EndpointPriceOverride[] for SDK consumption. Returns undefined if no flags were passed.
 */
function buildEndpointPrices(
  free: string[] | undefined,
  paid: string[] | undefined,
): EndpointPriceOverride[] | undefined {
  const out: EndpointPriceOverride[] = [];
  for (const spec of free ?? []) {
    const [path, capStr] = spec.split(':');
    if (!path) continue;
    const entry: EndpointPriceOverride = { path, pricing_unit: 'per_request', price_per_request: 0 };
    if (capStr) entry.daily_cap_per_wallet = parseInt(capStr, 10);
    out.push(entry);
  }
  for (const spec of paid ?? []) {
    const [path, priceStr] = spec.split('=');
    if (!path || !priceStr) continue;
    out.push({ path, pricing_unit: 'per_request', price_per_request: parseInt(priceStr, 10) });
  }
  return out.length > 0 ? out : undefined;
}

/** Register the `listings update` subcommand. */
export function registerUpdateSubcommand(listings: Command, program: Command): void {
  listings
    .command('update <id>')
    .description('Update a listing (capacity, pricing, categories, description, paths, free endpoints)')
    .option('--total-rpm <n>', 'Total RPM capacity')
    .option('--reserved-rpm <n>', 'Reserved RPM')
    .option('--price <n>', 'Price per request in micro-USDC (min 1000 = $0.001)')
    .option('--categories <slugs>', 'Category slugs (comma-separated)')
    .option('--description <text>', 'Listing description')
    .option('--allowed-paths <paths>', 'Allowed paths (comma-separated)')
    .option('--endpoints <file>', 'Path to JSON file containing EndpointSpec[]')
    .option('--shield <on|off>', `Shield request scanning: ${SHIELD_SURCHARGE_DISPLAY}/req from payout`)
    // Phase 51.5: per-endpoint pricing + free-tier flags. Repeatable.
    .option('--free-endpoint <spec>', 'Mark endpoint as free (repeatable). Format: "/path" or "/path:wallet-cap".', collectArr, [] as string[])
    .option('--endpoint-price <spec>', 'Per-endpoint price override (repeatable). Format: "/path=microUSDC".', collectArr, [] as string[])
    .option('--free-daily-cap-per-wallet <n>', 'Listing-level per-wallet daily cap for free endpoints.')
    .option('--free-daily-cap-global <n>', 'Listing-level global daily cap for free endpoints.')
    .action(async (id: string, opts: {
      totalRpm?: string;
      reservedRpm?: string;
      price?: string;
      categories?: string;
      description?: string;
      allowedPaths?: string;
      endpoints?: string;
      shield?: string;
      freeEndpoint?: string[];
      endpointPrice?: string[];
      freeDailyCapPerWallet?: string;
      freeDailyCapGlobal?: string;
    }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const updates: Record<string, unknown> = {};
        if (opts.totalRpm !== undefined) updates.total_rpm = parseInt(opts.totalRpm, 10);
        if (opts.reservedRpm !== undefined) updates.reserved_rpm = parseInt(opts.reservedRpm, 10);
        if (opts.price !== undefined) updates.price_per_request = parseInt(opts.price, 10);
        if (opts.categories !== undefined) updates.category_slugs = opts.categories.split(',').map((s) => s.trim());
        if (opts.description !== undefined) updates.description = opts.description;
        if (opts.allowedPaths !== undefined) updates.allowed_paths = opts.allowedPaths.split(',').map((s) => s.trim());
        if (opts.endpoints !== undefined) updates.endpoints = JSON.parse(await readFile(opts.endpoints, 'utf-8'));
        if (opts.shield !== undefined) {
          if (opts.shield !== 'on' && opts.shield !== 'off') {
            console.error(red('Error: --shield must be "on" or "off"'));
            process.exit(1);
          }
          updates.shield_enabled = opts.shield === 'on';
        }
        // Phase 51.5: free-tier + endpoint-pricing updates. endpoint_prices REPLACES the
        // entire array (you cannot patch a single entry — pass the full set you want).
        const endpointPrices = buildEndpointPrices(opts.freeEndpoint, opts.endpointPrice);
        if (endpointPrices !== undefined) updates.endpoint_prices = endpointPrices;
        if (opts.freeDailyCapPerWallet !== undefined) updates.free_daily_cap_per_wallet = parseInt(opts.freeDailyCapPerWallet, 10);
        if (opts.freeDailyCapGlobal !== undefined) updates.free_daily_cap_global = parseInt(opts.freeDailyCapGlobal, 10);

        if (Object.keys(updates).length === 0) {
          console.error(red('Error: at least one update flag is required'));
          console.error(dim('Available: --total-rpm, --reserved-rpm, --price, --categories, --description, --allowed-paths, --shield, --free-endpoint, --endpoint-price, --free-daily-cap-per-wallet, --free-daily-cap-global'));
          process.exit(1);
        }

        const client = await getClient(parentOpts);
        const result = await client.listings.update(id, updates);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}
