import type { Command } from 'commander';
import type { ShieldMode, SellerStrategy, ProxygateClient } from '@proxygate/sdk';
import { parseSSE, parseShieldInfo, spendLimitErrorFromResponse, SHIELD_SURCHARGE_DISPLAY } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { red, dim, yellow, cyan } from '../format.js';
import { handleError } from '../errors.js';
import { graphqlErrorWarning } from './graphql-warning.js';

/**
 * Register the `proxygate proxy` command.
 *
 * Sends a request through the Proxygate proxy to an upstream API
 * using the listing-centric proxy(listingId, path, body, options?) API.
 *
 * Listing identifier accepts three forms (resolved by SDK Phase 51-08):
 *   1. seller-handle/listing-slug — recommended, copy-paste from URLs
 *   2. listing-slug or service-name — single-segment, legacy + service fallback
 *   3. UUID — advanced, scriptable, bypasses slug resolution
 *
 * @example
 * proxygate proxy blockdb/blockdb-api /v1/forecast -d '{...}'
 * proxygate proxy weather-api /v1/forecast -d '{...}'
 * proxygate proxy abc12345-6789-abcd-ef01-234567890abc /v1/data -X GET
 */
export function registerProxyCommand(program: Command): void {
  program
    .command('proxy')
    .description('Send a proxied request to an upstream API through a seller listing')
    .argument(
      '<listing>',
      'Listing identifier: seller-handle/listing-slug (recommended), listing-slug or service name, or listing UUID',
    )
    .argument('<path>', 'Upstream API path (e.g., /v1/chat/completions)')
    .option('-d, --data <json>', 'Request body as JSON string')
    .option('-X, --method <method>', 'HTTP method (default: POST if -d given, GET otherwise)')
    .option('--stream', 'Stream SSE response chunks to stdout')
    .option('--shield <mode>', `Shield scanning: off (default), monitor, or strict (+${SHIELD_SURCHARGE_DISPLAY}/req)`)
    .option('--seller <strategy>', 'Seller selection: popular (default), cheapest, best-rated, fastest')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  # Composite seller-handle/listing-slug (recommended, copy-paste from URLs)\n' +
        '  $ proxygate proxy blockdb/blockdb-api /v1/forecast \\\n' +
        "    -d '{\"latitude\":52.37,\"longitude\":4.90}'\n\n" +
        '  # Single-segment slug or service name (legacy, picks default seller)\n' +
        '  $ proxygate proxy weather-api /v1/forecast \\\n' +
        "    -d '{\"latitude\":52.37,\"longitude\":4.90,\"hourly\":\"temperature_2m\"}'\n\n" +
        '  # Listing UUID (advanced, scriptable, bypasses slug resolution)\n' +
        '  $ proxygate proxy abc12345-6789-abcd-ef01-234567890abc /v1/data -X GET\n\n' +
        '  # Streaming\n' +
        '  $ proxygate proxy blockdb/blockdb-api /v1/forecast --stream \\\n' +
        "    -d '{\"latitude\":52.37,\"longitude\":4.90}'\n\n" +
        'Listing identifier forms (smart-detected by the SDK):\n' +
        '  seller-handle/listing-slug : recommended, unique per seller (e.g. blockdb/blockdb-api)\n' +
        '  listing-slug or service    : single segment; falls back to service-name resolution\n' +
        '  listing UUID               : explicit, bypasses slug detection\n\n' +
        'Browse available APIs: proxygate apis -q <search>\n\n' +
        'Shield modes:\n' +
        '  off      : no scanning, no surcharge (default)\n' +
        '  monitor  : scan response for harmful content, log but allow (+$0.005/req)\n' +
        '  strict   : block response if flagged, credits refunded (+$0.005/req)\n\n' +
        'Seller strategies:\n' +
        '  popular    : highest capacity (default)\n' +
        '  cheapest   : lowest price per request\n' +
        '  best-rated : highest trust score\n' +
        '  fastest    : lowest average latency',
    )
    .action(
      async (
        listingId: string,
        path: string,
        opts: { data?: string; method?: string; stream?: boolean; shield?: string; seller?: string },
      ) => {
        const parentOpts = program.opts<{ gateway?: string; keypair?: string; apiKey?: string }>();

        try {
          const client = await getClient(parentOpts);

          // Parse request body
          let body: unknown = undefined;
          if (opts.data) {
            try {
              body = JSON.parse(opts.data);
            } catch {
              console.error(red('Error: Invalid JSON in --data argument'));
              process.exit(1);
            }
          }

          // Validate shield mode (default: off — opt-in to avoid surprise surcharges)
          const validShieldModes = ['monitor', 'strict', 'off'];
          const shieldInput = opts.shield ?? 'off';
          if (!validShieldModes.includes(shieldInput)) {
            console.error(red(`Error: Invalid shield mode '${shieldInput}'. Use: monitor, strict, or off`));
            process.exit(1);
          }
          const shield = shieldInput as ShieldMode;

          // Validate seller strategy
          const validSellerStrategies = ['popular', 'cheapest', 'best-rated', 'fastest'];
          if (opts.seller && !validSellerStrategies.includes(opts.seller)) {
            console.error(red(`Error: Invalid seller strategy '${opts.seller}'. Use: popular, cheapest, best-rated, or fastest`));
            process.exit(1);
          }
          const seller = opts.seller as SellerStrategy | undefined;

          // Determine HTTP method
          const method = (opts.method ?? (body ? 'POST' : 'GET')).toUpperCase();
          const shieldLabel = shield ? ` [shield:${shield}]` : '';
          console.error(dim(`${method} ${listingId}${path}${shieldLabel}`));

          // Streaming mode
          if (opts.stream) {
            console.error(dim(`Streaming ${listingId}${path}...`));

            const response = await client.proxy(listingId, path, body, { method, shield, seller });
            if (!response.body) {
              console.error(red('Error: No response body for streaming'));
              process.exit(1);
            }

            printShieldInfo(response);

            for await (const event of parseSSE(response)) {
              if (event.data === '[DONE]') break;
              process.stdout.write(event.data + '\n');
            }
            printRequestMeta(response);
            return;
          }

          // Execute request
          const response = await client.proxy(listingId, path, body, { method, shield, seller });

          // Handle 429 — could be spend limit, gateway rate limit, or upstream rate limit.
          if (response.status === 429) {
            // Classify spend-limit blocks via the SDK so daily vs per-transaction
            // wording stays in sync with the gateway error codes. The helper
            // consumes a response body, so hand it a clone and keep the original
            // for the rate-limit branches below.
            const spendLimit = await spendLimitErrorFromResponse(response.clone());
            const text = await response.text();
            let body: Record<string, unknown> | null = null;
            try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
            const errorCode = body?.error as string ?? body?.code as string ?? '';
            const isGatewayRateLimit = errorCode === 'rate_limited';
            if (spendLimit) {
              const window = spendLimit.reason === 'per_tx' ? 'per-transaction' : 'daily';
              console.error(red(`Blocked: this call would exceed your ${window} spend limit.`));
              console.error(dim(spendLimit.message));
              console.error(dim('Adjust it in the Proxygate web app under Wallets > Limits.'));
            } else if (isGatewayRateLimit) {
              console.error(red('Rate limited by gateway'));
              if (body?.message) console.error(dim(body.message as string));
            } else {
              console.error(red('Rate limited by upstream API'));
              if (body?.message) console.error(dim(body.message as string));
              else if (text) console.error(dim(text.slice(0, 200)));
              console.error(dim('The API provider is rate limiting requests. Try again later.'));
            }
            process.exit(1);
          }

          // Handle shield block (422)
          if (response.status === 422) {
            const text = await response.text();
            let blocked: Record<string, unknown> | null = null;
            try { blocked = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
            if (blocked?.code === 'shield_blocked') {
              console.error(yellow(`Shield blocked response (score: ${blocked.shield_score})`));
              console.error(yellow(`Flags: ${(blocked.shield_flags as string[])?.join(', ') ?? 'unknown'}`));
              console.error(dim(blocked.message as string));
              if (blocked.refunded) console.error(dim('Credits refunded.'));
              process.exit(1);
            }
            console.log(text);
            console.error(dim(`Status: ${response.status}`));
            return;
          }

          // Print shield info to stderr
          printShieldInfo(response);

          // Print response
          const text = await response.text();
          let parsed: unknown = undefined;
          let parsedOk = false;
          try {
            parsed = JSON.parse(text);
            parsedOk = true;
            console.log(JSON.stringify(parsed, null, 2));
          } catch {
            console.log(text);
          }

          // Print request metadata to stderr
          printRequestMeta(response);

          // GraphQL fails with HTTP 200 + an `errors` body, so the agent must be
          // warned even on a 2xx. Warning goes to stderr only; stdout stays clean.
          if (parsedOk) {
            const gqlWarning = graphqlErrorWarning(path, parsed);
            if (gqlWarning) console.error(gqlWarning);
          }

          // Print status to stderr if not 200, plus best-effort endpoint hint
          // so an agent can self-correct without guessing paths.
          if (!response.ok) {
            console.error(dim(`Status: ${response.status}`));
            await printListingEndpointHint(client, listingId);
          }
        } catch (err) {
          handleError(err);
        }
      },
    );
}

/** Print cost, request ID, and spend limit info from response headers. */
function printRequestMeta(response: Response): void {
  const parts: string[] = [];

  // Cost from receipt header
  const receiptB64 = response.headers.get('x-proxygate-receipt');
  if (receiptB64) {
    try {
      const receipt = JSON.parse(Buffer.from(receiptB64, 'base64').toString()) as {
        request_id?: string; amount?: number; seller?: string;
      };
      if (receipt.amount != null) {
        parts.push(`cost: $${(receipt.amount / 1_000_000).toFixed(4)}`);
      }
      if (receipt.request_id) {
        parts.push(`request: ${receipt.request_id}`);
      }
    } catch { /* malformed receipt */ }
  }

  // Spend limit — shown as "spent today" so a small spend doesn't look like
  // a near-limit warning. e.g. $4.99/$5.00 remaining (old) → $0.01 / $5.00 (new).
  const remaining = response.headers.get('x-spendlimit-remaining');
  const limit = response.headers.get('x-spendlimit-limit');
  if (remaining && limit) {
    const remainNum = parseInt(remaining, 10);
    const limitNum = parseInt(limit, 10);
    if (!isNaN(remainNum) && !isNaN(limitNum) && limitNum > 0) {
      const spentNum = Math.max(0, limitNum - remainNum);
      const usedPct = Math.round((spentNum / limitNum) * 100);
      const spentUsdc = (spentNum / 1_000_000).toFixed(2);
      const limitUsdc = (limitNum / 1_000_000).toFixed(2);
      const label = `spent today: $${spentUsdc} / $${limitUsdc}`;
      parts.push(usedPct >= 80 ? yellow(label) : label);
    }
  }

  if (parts.length > 0) {
    console.error(dim(parts.join(' | ')));
  }

  // Show rating hint for successful requests
  if (response.ok && receiptB64) {
    try {
      const receipt = JSON.parse(Buffer.from(receiptB64, 'base64').toString()) as { request_id?: string };
      if (receipt.request_id) {
        console.error(dim(`rate: proxygate rate --request-id ${receipt.request_id} --up/--down`));
      }
    } catch { /* ignore */ }
  }
}

function printShieldInfo(response: Response): void {
  const info = parseShieldInfo(response);
  if (!info) return;
  const parts = [cyan(`Shield: ${info.mode}`)];
  if (info.score !== undefined) parts.push(`score: ${info.score.toFixed(3)}`);
  if (info.flags && info.flags !== 'none') parts.push(yellow(`flags: ${info.flags}`));
  console.error(dim(parts.join(' | ')));
}

/**
 * Best-effort endpoint hint shown on any non-2xx response.
 *
 * When an upstream returns 404 (e.g. wrong path), agents otherwise guess paths
 * blindly. Looking up the listing's documented endpoints and showing them inline
 * lets the next attempt be informed without a separate `listings docs` call.
 *
 * Silently no-ops on any failure — never break the main command flow.
 */
async function printListingEndpointHint(client: ProxygateClient, listingId: string): Promise<void> {
  try {
    const query = listingId.includes('/') ? (listingId.split('/').pop() ?? listingId) : listingId;
    const result = await Promise.race([
      client.apis({ service: undefined, q: query, limit: 10 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('hint_timeout')), 5000)),
    ]);

    const listings = result.data;
    const composite = listingId.includes('/') ? listingId.toLowerCase() : null;
    const listing =
      listings.find((l) => l.listing_id === listingId) ??
      listings.find((l) =>
        composite !== null && `${l.seller_slug ?? ''}/${l.slug ?? ''}`.toLowerCase() === composite,
      ) ??
      listings.find((l) => l.slug === query) ??
      listings.find((l) => l.service === query) ??
      listings[0];

    if (!listing || !listing.endpoints?.length) return;

    console.error('');
    console.error(dim('Hint: This listing supports these endpoints:'));
    const shown = listing.endpoints.slice(0, 8);
    let anyWritesBody = false;
    for (const ep of shown) {
      const method = (ep.method ?? 'GET').toString().toUpperCase();
      const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH';
      if (isWrite) anyWritesBody = true;
      const bodyMarker = isWrite ? ' (body)' : '';
      const path = ep.path ?? '/';
      const summary = ep.description ? `  ${ep.description.slice(0, 60)}` : '';
      console.error(dim(`  ${method.padEnd(6)} ${path}${bodyMarker}${summary}`));
    }
    if (listing.endpoints.length > shown.length) {
      console.error(dim(`  ... and ${listing.endpoints.length - shown.length} more`));
    }
    if (anyWritesBody) {
      console.error(dim(`For request body schemas: proxygate listings docs ${listing.listing_id} --raw`));
    } else {
      console.error(dim(`View full docs: proxygate listings docs ${listing.listing_id}`));
    }
  } catch {
    // Best-effort only — never break the command on hint lookup failure.
  }
}
