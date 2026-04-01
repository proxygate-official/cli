import type { Command } from 'commander';
import type { ShieldMode, SellerStrategy } from '@proxygate/sdk';
import { parseSSE, parseShieldInfo, SHIELD_SURCHARGE_DISPLAY } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { red, dim, yellow, cyan } from '../format.js';
import { handleError } from '../errors.js';

/**
 * Register the `proxygate proxy` command.
 *
 * Sends a request through the ProxyGate proxy to an upstream API
 * using the listing-centric proxy(listingId, path, body, options?) API.
 *
 * @example
 * proxygate proxy abc-123 /v1/chat/completions -d '{"model":"gpt-4","messages":[...]}'
 * proxygate proxy abc-123 /v1/models -X GET
 * proxygate proxy abc-123 /v1/chat/completions -d '...' --stream
 */
export function registerProxyCommand(program: Command): void {
  program
    .command('proxy')
    .description('Send a proxied request to an upstream API through a seller listing')
    .argument('<listing>', 'Service name, slug, or listing UUID')
    .argument('<path>', 'Upstream API path (e.g., /v1/chat/completions)')
    .option('-d, --data <json>', 'Request body as JSON string')
    .option('-X, --method <method>', 'HTTP method (default: POST if -d given, GET otherwise)')
    .option('--stream', 'Stream SSE response chunks to stdout')
    .option('--shield <mode>', `Shield scanning: off (default), monitor, or strict (+${SHIELD_SURCHARGE_DISPLAY}/req)`)
    .option('--seller <strategy>', 'Seller selection: popular (default), cheapest, best-rated, fastest')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate proxy agent-postal-lookup /nl/1012\n\n' +
        '  $ proxygate proxy weather-api /v1/forecast \\\n' +
        "    -d '{\"latitude\":52.37,\"longitude\":4.90,\"hourly\":\"temperature_2m\"}'\n\n" +
        '  $ proxygate proxy abc12345-6789-abcd-ef01-234567890abc /v1/data -X GET\n\n' +
        '  $ proxygate proxy weather-api /v1/forecast --stream \\\n' +
        "    -d '{\"latitude\":52.37,\"longitude\":4.90}'\n\n" +
        'Accepts a service name, slug, or listing UUID.\n' +
        'Browse available APIs: proxygate apis -q <search>\n\n' +
        'Shield modes:\n' +
        '  off      — no scanning, no surcharge (default)\n' +
        '  monitor  — scan response for harmful content, log but allow (+$0.005/req)\n' +
        '  strict   — block response if flagged, credits refunded (+$0.005/req)\n\n' +
        'Seller strategies:\n' +
        '  popular    — highest capacity (default)\n' +
        '  cheapest   — lowest price per request\n' +
        '  best-rated — highest trust score\n' +
        '  fastest    — lowest average latency',
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

          // Handle 429 — could be spend limit, gateway rate limit, or upstream rate limit
          if (response.status === 429) {
            const text = await response.text();
            let body: Record<string, unknown> | null = null;
            try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
            const errorCode = body?.error as string ?? body?.code as string ?? '';
            const isSpendLimit = errorCode.includes('spend_limit') || errorCode === 'daily_spend_limit_exceeded' || errorCode === 'per_tx_spend_limit_exceeded';
            const isGatewayRateLimit = errorCode === 'rate_limited';
            if (isSpendLimit) {
              console.error(red('Spend limit exceeded'));
              if (body?.message) console.error(dim(body.message as string));
              console.error(dim('Increase your limit: app.proxygate.ai/wallets'));
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
          try {
            const json: unknown = JSON.parse(text);
            console.log(JSON.stringify(json, null, 2));
          } catch {
            console.log(text);
          }

          // Print request metadata to stderr
          printRequestMeta(response);

          // Print status to stderr if not 200
          if (!response.ok) {
            console.error(dim(`Status: ${response.status}`));
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

  // Spend limit
  const remaining = response.headers.get('x-spendlimit-remaining');
  const limit = response.headers.get('x-spendlimit-limit');
  if (remaining && limit) {
    const remainNum = parseInt(remaining, 10);
    const limitNum = parseInt(limit, 10);
    if (!isNaN(remainNum) && !isNaN(limitNum) && limitNum > 0) {
      const usedPct = Math.round(((limitNum - remainNum) / limitNum) * 100);
      const remainUsdc = (remainNum / 1_000_000).toFixed(2);
      const limitUsdc = (limitNum / 1_000_000).toFixed(2);
      if (usedPct >= 80) {
        parts.push(yellow(`limit: $${remainUsdc}/$${limitUsdc} remaining`));
      } else {
        parts.push(`limit: $${remainUsdc}/$${limitUsdc}`);
      }
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
