import type { Command } from 'commander';
import type { ShieldMode } from '@proxygate/sdk';
import { ProxyGateError, parseSSE, parseShieldInfo } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { red, dim, yellow, cyan } from '../format.js';

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
    .argument('<listing-id>', 'Listing UUID (get from `proxygate pricing --json`)')
    .argument('<path>', 'Upstream API path (e.g., /v1/chat/completions)')
    .option('-d, --data <json>', 'Request body as JSON string')
    .option('-X, --method <method>', 'HTTP method (default: POST if -d given, GET otherwise)')
    .option('--stream', 'Stream SSE response chunks to stdout')
    .option('--shield <mode>', 'Shield scanning mode: monitor, strict, or off')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate proxy abc-123 /v1/chat/completions \\\n' +
        "    -d '{\"model\":\"gpt-4\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'\n\n" +
        '  $ proxygate proxy abc-123 /v1/models -X GET\n\n' +
        '  $ proxygate proxy abc-123 /v1/chat/completions --stream \\\n' +
        "    -d '{\"model\":\"gpt-4\",\"messages\":[...],\"stream\":true}'\n\n" +
        'The listing ID determines which seller and service to use.\n' +
        'Get listing IDs with: proxygate pricing --json',
    )
    .action(
      async (
        listingId: string,
        path: string,
        opts: { data?: string; method?: string; stream?: boolean; shield?: string },
      ) => {
        const parentOpts = program.opts<{ gateway?: string; keypair?: string }>();

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

          // Validate shield mode
          const validShieldModes = ['monitor', 'strict', 'off'];
          let shield: ShieldMode | undefined;
          if (opts.shield) {
            if (!validShieldModes.includes(opts.shield)) {
              console.error(red(`Error: Invalid shield mode '${opts.shield}'. Use: monitor, strict, or off`));
              process.exit(1);
            }
            shield = opts.shield as ShieldMode;
          }

          // Determine HTTP method
          const method = (opts.method ?? (body ? 'POST' : 'GET')).toUpperCase();
          const shieldLabel = shield ? ` [shield:${shield}]` : '';
          console.error(dim(`${method} ${listingId}${path}${shieldLabel}`));

          // Streaming mode
          if (opts.stream) {
            console.error(dim(`Streaming ${listingId}${path}...`));

            const response = await client.proxy(listingId, path, body, { method, shield });
            if (!response.body) {
              console.error(red('Error: No response body for streaming'));
              process.exit(1);
            }

            printShieldInfo(response);

            for await (const event of parseSSE(response)) {
              if (event.data === '[DONE]') break;
              process.stdout.write(event.data + '\n');
            }
            return;
          }

          // Execute request
          const response = await client.proxy(listingId, path, body, { method, shield });

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

          // Print status to stderr if not 200
          if (!response.ok) {
            console.error(dim(`Status: ${response.status}`));
          }
        } catch (err) {
          if (err instanceof ProxyGateError) {
            console.error(red(`Error [${err.code}]: ${err.message}`));
            if (err.action) console.error(dim(`Suggestion: ${err.action}`));
            process.exit(1);
          }
          throw err;
        }
      },
    );
}

function printShieldInfo(response: Response): void {
  const info = parseShieldInfo(response);
  if (!info) return;
  const parts = [cyan(`Shield: ${info.mode}`)];
  if (info.score !== undefined) parts.push(`score: ${info.score.toFixed(3)}`);
  if (info.flags && info.flags !== 'none') parts.push(yellow(`flags: ${info.flags}`));
  console.error(dim(parts.join(' | ')));
}
