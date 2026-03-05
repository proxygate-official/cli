import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { Command } from 'commander';
import yaml from 'js-yaml';
import nacl from 'tweetnacl';
import { createTunnelClient } from '@proxygate/sdk';
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
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Base58 alphabet (same as Solana). */
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Encode bytes as base58 string. */
function encodeBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let result = '';
  for (const byte of bytes) {
    if (byte === 0) result += BASE58_ALPHABET[0];
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

/** Load and parse a Solana keypair JSON file, returning secretKey + walletAddress. */
async function loadKeypair(keypairPath: string): Promise<{
  secretKey: Uint8Array;
  walletAddress: string;
}> {
  let resolvedPath = keypairPath;
  if (resolvedPath.startsWith('~')) {
    resolvedPath = resolvedPath.replace(/^~/, homedir());
  }
  resolvedPath = resolve(resolvedPath);

  const raw = await readFile(resolvedPath, 'utf-8');
  const keyArray: unknown = JSON.parse(raw);

  if (
    !Array.isArray(keyArray) ||
    keyArray.length !== 64 ||
    !keyArray.every((n) => typeof n === 'number')
  ) {
    throw new Error(
      `Invalid keypair file: expected JSON array of 64 numbers, got ${
        Array.isArray(keyArray) ? `array of ${keyArray.length}` : typeof keyArray
      }`,
    );
  }

  const secretKey = Uint8Array.from(keyArray as number[]);
  const publicKey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
  const walletAddress = encodeBase58(publicKey);

  return { secretKey, walletAddress };
}

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
        // 3. Load keypair
        // ---------------------------------------------------------------
        const { secretKey, walletAddress } = await loadKeypair(keypairPath);

        console.log(bold('ProxyGate Tunnel'));
        console.log();
        console.log(`  ${dim('Wallet:')}  ${walletAddress}`);
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
        // 5. Create tunnel client and connect
        // ---------------------------------------------------------------
        const client = createTunnelClient({
          gatewayUrl,
          walletAddress,
          secretKey,
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

        async function shutdown(): Promise<void> {
          if (shuttingDown) return;
          shuttingDown = true;
          console.log();
          console.log(dim('Draining tunnel (waiting for in-flight requests)...'));
          try {
            await client.drain();
            console.log(dim('Drain complete. Disconnecting...'));
          } catch {
            console.log(dim('Drain failed. Disconnecting...'));
          }
          client.disconnect();
          process.exit(0);
        }

        process.on('SIGINT', () => { shutdown(); });
        process.on('SIGTERM', () => { shutdown(); });

        // ---------------------------------------------------------------
        // 7. Connect
        // ---------------------------------------------------------------
        console.log(dim('Connecting to gateway...'));
        console.log();

        await client.connect();

        // Keep process alive
        await new Promise(() => {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(red(`Error: ${message}`));
        process.exit(1);
      }
    });
}
