import type { Command } from 'commander';
import { getClient } from '../../helpers.js';
import { bold, dim, formatTable } from '../../format.js';
import { truncate, handleError } from './helpers.js';

/** Format endpoint price for display. Falls back to listing default price. */
function formatEndpointPrice(
  ep: { path?: string },
  endpointPrices: Array<{ path: string; pricing_unit: string; price_per_request?: number; price_per_input_token?: number; price_per_output_token?: number }> | undefined,
  defaultPrice: string,
): string {
  if (!endpointPrices || endpointPrices.length === 0) return defaultPrice;
  const match = endpointPrices.find((p) => p.path === ep.path);
  if (!match) return defaultPrice;
  if (match.pricing_unit === 'per_token') {
    const input = match.price_per_input_token ? (match.price_per_input_token / 1_000_000).toFixed(6) : '0';
    const output = match.price_per_output_token ? (match.price_per_output_token / 1_000_000).toFixed(6) : '0';
    return `$${input}/$${output}/tok`;
  }
  return match.price_per_request ? `$${(match.price_per_request / 1_000_000).toFixed(4)}/req` : defaultPrice;
}

/** Register the `listings docs` subcommand. */
export function registerDocsSubcommand(listings: Command, program: Command): void {
  listings
    .command('docs <id>')
    .description('View API documentation for a listing')
    .option('--raw', 'Output raw content (OpenAPI spec or markdown)')
    .action(async (id: string, opts: { raw?: boolean }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; json?: boolean }>();

      try {
        const client = await getClient(parentOpts);
        const [docs, listing] = await Promise.all([
          client.docs(id),
          client.apis({ service: undefined, q: undefined, limit: 100 }).then((r) => r.data.find((l) => l.listing_id === id)).catch(() => undefined),
        ]);

        if (!docs) {
          console.log(dim('No documentation found for this listing.'));
          return;
        }

        if (opts.raw) {
          console.log(docs.content);
          return;
        }

        // Structured output
        console.log(bold(`Documentation (${docs.doc_type})`));
        console.log(dim(`Listing: ${docs.listing_id}`));
        console.log(dim(`Updated: ${docs.updated_at}`));
        if (listing) {
          const defaultPrice = listing.price_per_request_usdc != null ? `$${listing.price_per_request_usdc}/req` : 'per-token';
          console.log(dim(`Default price: ${defaultPrice}`));
        }
        console.log();

        if (docs.doc_type === 'openapi' && docs.parsed_endpoints) {
          console.log(bold('Endpoints:'));
          console.log();
          const endpointPrices = listing?.endpoint_prices as Array<{ path: string; pricing_unit: string; price_per_request?: number; price_per_input_token?: number; price_per_output_token?: number }> | undefined;
          const defaultPrice = listing?.price_per_request_usdc != null ? `$${listing.price_per_request_usdc}/req` : 'per-token';
          const headers = ['Method', 'Path', 'Summary', 'Price'];
          const rows = (docs.parsed_endpoints as Array<{ method?: string; path?: string; summary?: string }>).map((ep) => [
            ep.method ?? '',
            ep.path ?? '',
            truncate(ep.summary ?? '', 40),
            formatEndpointPrice(ep, endpointPrices, defaultPrice),
          ]);
          console.log(formatTable(headers, rows));
        } else {
          console.log(docs.content);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
