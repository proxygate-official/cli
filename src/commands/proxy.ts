import type { Command } from 'commander';
import { ProxyGateError } from '@proxygate/sdk';
import type { ProxyChain, SSEEvent } from '@proxygate/sdk';
import { getClient } from '../helpers.js';
import { red, dim, cyan } from '../format.js';

/**
 * Traverse the proxy chain using path segments.
 *
 * Given segments ['openai', 'v1', 'chat', 'completions'], this builds
 * the chain: client.proxy.openai.v1.chat.completions
 *
 * NOTE: Using `any` for the chain traversal is acceptable here because
 * ProxyChain uses a recursive index signature (Proxy-based), and
 * TypeScript cannot statically verify arbitrary dynamic path segments.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function traverseChain(proxy: ProxyChain, segments: string[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chain: any = proxy;
  for (const seg of segments) {
    chain = chain[seg];
  }
  return chain;
}

/**
 * Register the `proxygate proxy` command.
 *
 * Sends a request through the ProxyGate proxy to an upstream API.
 * Supports GET, POST (with JSON body), and SSE streaming.
 *
 * @example
 * proxygate proxy openai/v1/chat/completions -d '{"model":"gpt-4","messages":[...]}'
 * proxygate proxy openai/v1/models -X GET
 * proxygate proxy openai/v1/chat/completions -d '...' --stream
 */
export function registerProxyCommand(program: Command): void {
  program
    .command('proxy')
    .description('Send a request through the ProxyGate proxy')
    .argument('<service/path>', 'Service and path (e.g., openai/v1/chat/completions)')
    .option('-d, --data <json>', 'Request body as JSON string')
    .option('-X, --method <method>', 'HTTP method (default: POST if data, GET otherwise)')
    .option('--stream', 'Stream SSE response')
    .action(
      async (
        servicePath: string,
        opts: { data?: string; method?: string; stream?: boolean },
      ) => {
        const parentOpts = program.opts<{ gateway?: string; keypair?: string }>();

        try {
          const client = await getClient(parentOpts);

          const segments = servicePath.split('/');
          const chain = traverseChain(client.proxy, segments);

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

          // Streaming mode
          if (opts.stream) {
            console.error(dim(`Streaming ${servicePath}...`));

            const events: AsyncGenerator<SSEEvent> = chain.stream(body);
            for await (const event of events) {
              if (event.data === '[DONE]') break;
              process.stdout.write(event.data + '\n');
            }
            return;
          }

          // Determine HTTP method
          const method = (opts.method ?? (body ? 'POST' : 'GET')).toUpperCase();
          console.error(dim(`${method} ${servicePath}`));

          // Execute request
          let response: Response;
          switch (method) {
            case 'GET':
              response = await chain.get();
              break;
            case 'POST':
              response = await chain.post(body);
              break;
            case 'PUT':
              response = await chain.put(body);
              break;
            case 'PATCH':
              response = await chain.patch(body);
              break;
            case 'DELETE':
              response = await chain.delete();
              break;
            default:
              response = await chain.post(body);
              break;
          }

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
