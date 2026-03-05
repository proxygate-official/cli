import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import yaml from 'js-yaml';
import { createTunnelClient } from '@proxygate/sdk';
import type { TunnelServiceConfig } from '@proxygate/sdk';
import { loadConfig } from '../config.js';
import { bold, red, dim, green, yellow } from '../format.js';
import { loadKeypair, checkService, onConnected, onDisconnected, onError, onRequest } from './tunnel-handlers.js';

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
    endpoints?: Array<{ method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; path: string; description?: string }>;
  }>;
}

/**
 * Register the `proxygate tunnel` command.
 * Opens a reverse tunnel to the ProxyGate gateway, exposing local services.
 */
export function registerTunnelCommand(program: Command): void {
  program
    .command('tunnel')
    .description('Expose local services to ProxyGate via a reverse tunnel')
    .option('-c, --config <path>', 'Path to tunnel YAML config', 'proxygate.tunnel.yaml')
    .addHelpText('after',
      '\nExamples:\n  $ proxygate tunnel\n  $ proxygate tunnel -c my-services.yaml\n\n' +
      'Config file format (proxygate.tunnel.yaml):\n  services:\n    - name: my-api\n' +
      '      port: 8080\n      price_per_request: 1000\n      paths:\n        - /v1/*\n')
    .action(async (opts: { config: string }) => {
      const parentOpts = program.opts<{ gateway?: string; keypair?: string }>();
      try {
        const cliConfig = await loadConfig();
        const gatewayUrl = parentOpts.gateway ?? cliConfig?.gatewayUrl;
        const keypairPath = parentOpts.keypair ?? cliConfig?.keypairPath;

        if (!gatewayUrl || !keypairPath) {
          console.error(red('Error: Not configured. Run `proxygate init` first.'));
          console.error(dim('Or use --gateway and --keypair flags.'));
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

        const { secretKey, walletAddress } = await loadKeypair(keypairPath);
        console.log(bold('ProxyGate Tunnel'));
        console.log();
        console.log(`  ${dim('Wallet:')}  ${walletAddress}`);
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

        const client = createTunnelClient({
          gatewayUrl, walletAddress, secretKey, services,
          onConnected, onDisconnected, onError, onRequest,
        });

        let shuttingDown = false;
        async function shutdown(): Promise<void> {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log();
          console.log(dim('Draining tunnel (waiting for in-flight requests)...'));
          try { await client.drain(); console.log(dim('Drain complete. Disconnecting...')); }
          catch { console.log(dim('Drain failed. Disconnecting...')); }
          client.disconnect();
          process.exit(0);
        }
        process.on('SIGINT', () => { shutdown(); });
        process.on('SIGTERM', () => { shutdown(); });

        console.log(dim('Connecting to gateway...'));
        console.log();
        await client.connect();
        await new Promise(() => {});
      } catch (err) {
        console.error(red(`Error: ${err instanceof Error ? err.message : String(err)}`));
        process.exit(1);
      }
    });
}
