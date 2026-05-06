import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import yaml from 'js-yaml';
import { Proxygate } from '@proxygate/sdk';
import type { TunnelServiceConfig, TunnelClient } from '@proxygate/sdk';
import { loadConfig } from '../config.js';
import { bold, green, yellow, red, dim, cyan } from '../format.js';

function timestamp(): string {
  return dim(new Date().toISOString().replace('T', ' ').replace('Z', ''));
}

export function registerDevCommand(program: Command): void {
  program
    .command('dev')
    .description('Start tunnel in dev mode with verbose logging and config watching')
    .option('-c, --config <path>', 'Path to tunnel YAML config', 'proxygate.tunnel.yaml')
    .addHelpText(
      'after',
      '\nDev mode features:\n' +
        '  - Request/response logging with status, latency, and size\n' +
        '  - Auto-reload on proxygate.tunnel.yaml changes\n' +
        '  - Actionable error messages\n\n' +
        'Examples:\n' +
        '  $ proxygate dev\n' +
        '  $ proxygate dev -c my-services.yaml\n',
    )
    .action(async (opts: { config: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string }>();

      try {
        // Load CLI config
        const cliConfig = await loadConfig();
        const gatewayUrl = parentOpts.gateway ?? cliConfig?.gatewayUrl;
        const keypairPath = parentOpts.keypair ?? cliConfig?.keypairPath;

        if (!gatewayUrl || !keypairPath) {
          console.error(red('Error: Not configured. Run `proxygate init` first.'));
          console.error(dim('Or use --gateway and --keypair flags.'));
          process.exit(1);
        }

        // Load tunnel config
        const configPath = resolve(opts.config);

        async function loadTunnelConfig(): Promise<TunnelServiceConfig[]> {
          const content = await readFile(configPath, 'utf-8');
          const parsed = yaml.load(content) as { services?: TunnelServiceConfig[] };
          if (!parsed?.services?.length) {
            throw new Error('No services defined in tunnel config');
          }
          return parsed.services;
        }

        let services: TunnelServiceConfig[];
        try {
          services = await loadTunnelConfig();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(red(`Cannot read tunnel config: ${configPath}`));
          console.error(dim(msg));
          process.exit(1);
        }

        // Header
        console.log();
        console.log(bold(`Proxygate ${cyan('Dev Mode')}`));
        console.log();
        console.log(`  ${dim('Keypair:')} ${keypairPath}`);
        console.log(`  ${dim('Gateway:')} ${gatewayUrl}`);
        console.log();

        // Check services reachable
        for (const svc of services) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);
            await fetch(`http://localhost:${svc.port}`, { signal: controller.signal });
            clearTimeout(timeout);
            console.log(`  ${green('OK')}  ${svc.name} (localhost:${svc.port})`);
          } catch {
            console.log(
              `  ${yellow('WARN')}  ${svc.name} (localhost:${svc.port}) — not reachable. Is your server running?`,
            );
          }
        }
        console.log();

        // Track request start times for latency
        const requestStarts = new Map<string, number>();

        // Connect tunnel
        const connectStart = Date.now();
        const connectTimer = setInterval(() => {
          const elapsed = ((Date.now() - connectStart) / 1000).toFixed(0);
          process.stderr.write(`\x1b[2K\r${dim(`Connecting to gateway... (${elapsed}s)`)}`);
        }, 1000);
        process.stderr.write(dim('Connecting to gateway...'));

        let tunnel: TunnelClient = await Proxygate.serve({
          gatewayUrl,
          keypair: keypairPath,
          services,

          onConnected(listings) {
            clearInterval(connectTimer);
            process.stderr.write('\x1b[2K\r');
            console.log(green('Connected!'));
            for (const listing of listings) {
              console.log(`  ${bold(listing.service)} ${dim(listing.endpoint)}`);
            }
            console.log();
            console.log(dim(`Watching ${opts.config} for changes...`));
            console.log();
          },

          onDisconnected(reason) {
            console.log(`${timestamp()} ${yellow('Disconnected:')} ${reason}`);
            console.log(dim('Reconnecting in 5s...'));
          },

          onError(error) {
            let hint = '';
            const msg = error.message;
            if (msg.includes('ECONNREFUSED')) {
              hint = ' — is your server running?';
            } else if (msg.includes('invalid_services')) {
              hint = ' — use lowercase letters, numbers, and hyphens for service names';
            } else if (msg.includes('4409') || msg.includes('Duplicate')) {
              hint = ' — close the other tunnel connection first';
            } else if (msg.includes('timed out')) {
              hint = ' — check your service logs for slow responses';
            }
            console.error(`${timestamp()} ${red('Error:')} ${msg}${hint}`);
          },

          onRequest(requestId, service, path) {
            requestStarts.set(requestId, performance.now());
            console.log(
              `${timestamp()} ${green('>>>')} ${bold(service)} ${path} ${dim(requestId.slice(0, 8))}`,
            );
          },
        });

        // Watch config file for changes
        try {
          let debounceTimer: ReturnType<typeof setTimeout> | null = null;

          watch(configPath, () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
              try {
                const newServices = await loadTunnelConfig();
                console.log(`${timestamp()} ${cyan('Config changed')} — reconnecting...`);
                tunnel.disconnect();
                services = newServices;
                tunnel = await Proxygate.serve({
                  gatewayUrl,
                  keypair: keypairPath,
                  services: newServices,
                  onConnected(listings) {
                    console.log(green('Reconnected!'));
                    for (const listing of listings) {
                      console.log(`  ${bold(listing.service)} ${dim(listing.endpoint)}`);
                    }
                    console.log();
                  },
                  onDisconnected(reason) {
                    console.log(`${timestamp()} ${yellow('Disconnected:')} ${reason}`);
                  },
                  onError(error) {
                    console.error(`${timestamp()} ${red('Error:')} ${error.message}`);
                  },
                  onRequest(requestId, service, path) {
                    requestStarts.set(requestId, performance.now());
                    console.log(
                      `${timestamp()} ${green('>>>')} ${bold(service)} ${path} ${dim(requestId.slice(0, 8))}`,
                    );
                  },
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.error(`${timestamp()} ${red('Config reload failed:')} ${msg}`);
              }
            }, 500);
          });
        } catch {
          // File watching not available — skip silently
        }

        // Graceful shutdown
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

        // Keep alive
        await new Promise(() => {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(red(`Error: ${message}`));
        process.exit(1);
      }
    });
}
