import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import yaml from 'js-yaml';
import { ProxyGate } from '@proxygate/sdk';
import type { TunnelServiceConfig } from '@proxygate/sdk';
import { loadConfig } from '../config.js';
import { bold, green, yellow, red, dim, cyan } from '../format.js';

// ---------------------------------------------------------------------------
// YAML config shape
// ---------------------------------------------------------------------------

interface TunnelYamlConfig {
  services: Array<{
    name: string;
    port: number;
    price_per_request?: number;
    pricing_unit?: 'per_request' | 'per_token';
    price_per_input_token?: number;
    price_per_output_token?: number;
    paths?: string[];
    description?: string;
    endpoints?: Array<{
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
      path: string;
      description?: string;
    }>;
    docs?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a local service is reachable (non-fatal). */
async function checkService(name: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(`http://localhost:${port}`, { signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

/** Format a timestamp for log output. */
function timestamp(): string {
  return dim(new Date().toISOString().replace('T', ' ').replace('Z', ''));
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

/**
 * Register the `proxygate tunnel` command.
 *
 * Opens a reverse tunnel to the ProxyGate gateway, exposing local services
 * to the marketplace without sharing API keys.
 */
export function registerTunnelCommand(program: Command): void {
  program
    .command('tunnel')
    .description('Expose local services to ProxyGate via a reverse tunnel')
    .option('-c, --config <path>', 'Path to tunnel YAML config', 'proxygate.tunnel.yaml')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate tunnel\n' +
        '  $ proxygate tunnel -c my-services.yaml\n\n' +
        'Config file format (proxygate.tunnel.yaml):\n' +
        '  services:\n' +
        '    - name: my-api\n' +
        '      port: 8080\n' +
        '      price_per_request: 1000\n' +
        '      description: My local API service\n' +
        '      docs: ./openapi.yaml          # auto-uploaded on connect\n' +
        '      paths:\n' +
        '        - /v1/*\n',
    )
    .action(async (opts: { config: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string }>();

      try {
        // ---------------------------------------------------------------
        // 1. Load CLI config (gateway URL + keypair path)
        // ---------------------------------------------------------------
        const cliConfig = await loadConfig();
        const gatewayUrl = parentOpts.gateway ?? cliConfig?.gatewayUrl;
        const keypairPath = parentOpts.keypair ?? cliConfig?.keypairPath;

        if (!gatewayUrl || !keypairPath) {
          console.error(red('Error: Not configured. Run `proxygate init` first.'));
          console.error(dim('Or use --gateway and --keypair flags.'));
          process.exit(1);
        }

        // ---------------------------------------------------------------
        // 2. Load YAML tunnel config
        // ---------------------------------------------------------------
        const configPath = resolve(opts.config);
        let yamlContent: string;
        try {
          yamlContent = await readFile(configPath, 'utf-8');
        } catch {
          console.error(red(`Error: Cannot read tunnel config: ${configPath}`));
          console.error(dim('Create a proxygate.tunnel.yaml file or use -c <path>.'));
          process.exit(1);
        }

        const tunnelConfig = yaml.load(yamlContent) as TunnelYamlConfig;

        if (
          !tunnelConfig ||
          !Array.isArray(tunnelConfig.services) ||
          tunnelConfig.services.length === 0
        ) {
          console.error(red('Error: Tunnel config must have a non-empty "services" array.'));
          process.exit(1);
        }

        // Validate each service has name + port
        for (const svc of tunnelConfig.services) {
          if (!svc.name || typeof svc.name !== 'string') {
            console.error(red('Error: Each service must have a "name" (string).'));
            process.exit(1);
          }
          if (!svc.port || typeof svc.port !== 'number') {
            console.error(red(`Error: Service "${svc.name}" must have a "port" (number).`));
            process.exit(1);
          }
        }

        // ---------------------------------------------------------------
        // 3. Print header
        // ---------------------------------------------------------------
        console.log(bold('ProxyGate Tunnel'));
        console.log();
        console.log(`  ${dim('Keypair:')} ${keypairPath}`);
        console.log(`  ${dim('Gateway:')} ${gatewayUrl}`);
        console.log();

        // ---------------------------------------------------------------
        // 4. Check local services are reachable (non-fatal warnings)
        // ---------------------------------------------------------------
        const services: TunnelServiceConfig[] = tunnelConfig.services;

        for (const svc of services) {
          const reachable = await checkService(svc.name, svc.port);
          if (reachable) {
            console.log(`  ${green('OK')}  ${svc.name} (localhost:${svc.port})`);
          } else {
            console.log(
              `  ${yellow('WARN')}  ${svc.name} (localhost:${svc.port}) — not reachable yet`,
            );
          }
        }
        console.log();

        // ---------------------------------------------------------------
        // 5. Connect using SDK ProxyGate.serve()
        // ---------------------------------------------------------------
        console.log(dim('Connecting to gateway...'));
        console.log();

        const tunnel = await ProxyGate.serve({
          gatewayUrl,
          keypair: keypairPath,
          services,

          onConnected(listings) {
            console.log(green('Connected! Your services are live:'));
            console.log();
            for (const listing of listings) {
              console.log(`  ${bold(listing.service)}`);
              console.log(`    ${cyan(listing.endpoint)}`);
              console.log(`    ${dim(`Listing ID: ${listing.id}`)}`);
              console.log();
            }
            console.log(dim('Press Ctrl+C to disconnect.'));
            console.log();
          },

          onDisconnected(reason) {
            console.log(`${timestamp()} ${yellow('Disconnected:')} ${reason}`);
            console.log(dim('Reconnecting in 5s...'));
          },

          onError(error) {
            console.error(`${timestamp()} ${red('Error:')} ${error.message}`);
          },

          onRequest(requestId, service, path) {
            console.log(
              `${timestamp()} ${green('>>>')} ${bold(service)} ${path} ${dim(requestId.slice(0, 8))}`,
            );
          },
        });

        // ---------------------------------------------------------------
        // 6. Graceful shutdown on SIGINT/SIGTERM
        // ---------------------------------------------------------------
        let shuttingDown = false;

        function shutdown(): void {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log();
          console.log(dim('Disconnecting tunnel...'));
          tunnel.disconnect();
          process.exit(0);
        }

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Keep process alive
        await new Promise(() => {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(red(`Error: ${message}`));
        process.exit(1);
      }
    });
}
