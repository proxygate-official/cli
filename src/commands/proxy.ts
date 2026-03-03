import type { Command } from 'commander';
import { ProxyGateError, parseSSE } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { red, dim } from '../format.js';

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
        opts: { data?: string; method?: string; stream?: boolean },
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

          // Determine HTTP method
          const method = (opts.method ?? (body ? 'POST' : 'GET')).toUpperCase();
          console.error(dim(`${method} ${listingId}${path}`));

          // Streaming mode
          if (opts.stream) {
            console.error(dim(`Streaming ${listingId}${path}...`));

            const response = await client.proxy(listingId, path, body, { method });
            if (!response.body) {
              console.error(red('Error: No response body for streaming'));
              process.exit(1);
            }

            for await (const event of parseSSE(response)) {
              if (event.data === '[DONE]') break;
              process.stdout.write(event.data + '\n');
            }
            return;
          }

          // Execute request
          const response = await client.proxy(listingId, path, body, { method });

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
