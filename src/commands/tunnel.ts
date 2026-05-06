import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import yaml from 'js-yaml';
import { Proxygate } from '@proxygate/sdk';
import type { TunnelServiceConfig } from '@proxygate/sdk';
import { loadConfig } from '../config.js';
import { bold, red, dim, green, yellow, cyan } from '../format.js';

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
 * Opens a reverse tunnel to the Proxygate gateway, exposing local services.
 */
export function registerTunnelCommand(program: Command): void {
  program
    .command('tunnel')
    .description('Expose local services to Proxygate via a reverse tunnel')
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
      const parentOpts = program.opts<{ gateway?: string; keypair?: string; apiKey?: string }>();
      try {
        const cliConfig = await loadConfig();
        const gatewayUrl = parentOpts.gateway ?? cliConfig?.gatewayUrl;
        const keypairPath = parentOpts.keypair ?? cliConfig?.keypairPath;
        const apiKey = parentOpts.apiKey ?? cliConfig?.apiKey;

        if (!gatewayUrl || (!keypairPath && !apiKey)) {
          console.error(red('Error: Not configured. Run `proxygate init` first.'));
          console.error(dim('Or use --gateway and --keypair/--api-key flags.'));
          process.exit(1);
        }

        const configPath = resolve(opts.config);
        let yamlContent: string;
        try { yamlContent = await readFile(configPath, 'utf-8'); } catch {
          console.error(red(`Error: Cannot read tunnel config: ${configPath}`));
          console.error(dim('Create a proxygate.tunnel.yaml file or use -c <path>.'));
          process.exit(1);
        }

        const tunnelConfig = yaml.load(yamlContent) as TunnelYamlConfig;
        if (!tunnelConfig || !Array.isArray(tunnelConfig.services) || tunnelConfig.services.length === 0) {
          console.error(red('Error: Tunnel config must have a non-empty "services" array.'));
          process.exit(1);
        }
        for (const svc of tunnelConfig.services) {
          if (!svc.name || typeof svc.name !== 'string') { console.error(red('Error: Each service must have a "name" (string).')); process.exit(1); }
          if (!svc.port || typeof svc.port !== 'number') { console.error(red(`Error: Service "${svc.name}" must have a "port" (number).`)); process.exit(1); }
        }

        // ---------------------------------------------------------------
        // Print header
        // ---------------------------------------------------------------
        console.log(bold('Proxygate Tunnel'));
        console.log();
        if (apiKey) {
          console.log(`  ${dim('Auth:')} API Key (${apiKey.slice(0, 12)}...)`);
        } else {
          console.log(`  ${dim('Keypair:')} ${keypairPath}`);
        }
        console.log(`  ${dim('Gateway:')} ${gatewayUrl}`);
        console.log();

        const services: TunnelServiceConfig[] = tunnelConfig.services;
        for (const svc of services) {
          const reachable = await checkService(svc.name, svc.port);
          console.log(reachable
            ? `  ${green('OK')}  ${svc.name} (localhost:${svc.port})`
            : `  ${yellow('WARN')}  ${svc.name} (localhost:${svc.port}) — not reachable yet`);
        }
        console.log();

        // ---------------------------------------------------------------
        // Connect using SDK Proxygate.serve()
        // ---------------------------------------------------------------
        const connectStart = Date.now();
        const connectTimer = setInterval(() => {
          const elapsed = ((Date.now() - connectStart) / 1000).toFixed(0);
          process.stderr.write(`\x1b[2K\r${dim(`Connecting to gateway... (${elapsed}s)`)}`);
        }, 1000);
        process.stderr.write(dim('Connecting to gateway...'));

        const tunnel = await Proxygate.serve({
          gatewayUrl,
          keypair: keypairPath ?? undefined,
          apiKey,
          services,

          onConnected(listings) {
            clearInterval(connectTimer);
            process.stderr.write('\x1b[2K\r');
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
            let hint = '';
            if (reason.includes('4408') || reason.includes('Heartbeat')) {
              hint = ' (network issue or gateway restart)';
            }
            console.log(`${timestamp()} ${yellow('Disconnected:')} ${reason}${hint}`);
            console.log(dim('Reconnecting in 5s...'));
          },

          onError(error) {
            let hint = '';
            const msg = error.message;
            if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
              hint = '\n    Is your server running? Start it with: npm run dev';
            } else if (msg.includes('invalid_services') || msg.includes('Invalid service name')) {
              hint = '\n    Service names must be lowercase alphanumeric + hyphens (e.g., "my-api")';
            } else if (msg.includes('401') || msg.includes('Authentication')) {
              hint = "\n    Run 'proxygate init' to configure your wallet";
            } else if (msg.includes('4409') || msg.includes('Duplicate')) {
              hint = '\n    You already have a tunnel open for this wallet. Close the other connection first.';
            } else if (msg.includes('timed out')) {
              hint = '\n    Check your service logs — the request took longer than 30 seconds';
            }
            console.error(`${timestamp()} ${red('Error:')} ${msg}${hint}`);
          },

          onRequest(requestId, service, path) {
            console.log(
              `${timestamp()} ${green('>>>')} ${bold(service)} ${path} ${dim(requestId.slice(0, 8))}`,
            );
          },
        });

        let shuttingDown = false;
        async function shutdown(): Promise<void> {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log();
          console.log(dim('Draining tunnel (waiting for in-flight requests)...'));
          try { await tunnel.drain(); console.log(dim('Drain complete. Disconnecting...')); }
          catch { console.log(dim('Drain failed. Disconnecting...')); }
          tunnel.disconnect();
          process.exit(0);
        }
        process.on('SIGINT', () => { shutdown(); });
        process.on('SIGTERM', () => { shutdown(); });

        // Keep process alive
        await new Promise(() => {});
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}
