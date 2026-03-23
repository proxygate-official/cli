import { ProxyGateClient, parseKeypairBytes, encodeBase58 } from '@proxygate/sdk';
import nacl from 'tweetnacl';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig } from './config.js';
import { checkDelegationExpiry } from './lib/auth-check.js';
import { red, dim } from './format.js';

/**
 * Resolve a ProxyGateClient from CLI flags or saved config.
 *
 * Supports four auth modes:
 * - API key only (no keypair needed)
 * - Delegation token (browser-based login)
 * - Keypair only (existing behavior)
 * - Dual mode (API key + keypair for hybrid auth)
 *
 * Exits with code 1 if no auth method is available.
 */
export async function getClient(opts: {
  gateway?: string;
  keypair?: string;
  apiKey?: string;
}): Promise<ProxyGateClient> {
  const config = await loadConfig();
  const gatewayUrl = opts.gateway ?? config?.gatewayUrl;
  const keypairPath = opts.keypair ?? config?.keypairPath;
  const apiKey = opts.apiKey ?? config?.apiKey;
  const delegationToken = config?.delegationToken;

  if (!gatewayUrl) {
    console.error(red('Error: No gateway URL. Run `proxygate init` or `proxygate login` first.'));
    console.error(dim('Or use --gateway flag.'));
    process.exit(1);
  }

  // Check delegation token expiry before using it
  if (config) {
    checkDelegationExpiry(config);
  }

  // Delegation token (browser-based login, no keypair)
  if (delegationToken && !keypairPath && !apiKey) {
    return new ProxyGateClient({ gatewayUrl, delegationToken });
  }

  // API key only (no keypair)
  if (apiKey && !keypairPath) {
    return new ProxyGateClient({ gatewayUrl, apiKey });
  }

  // Dual mode (both API key and keypair)
  if (apiKey && keypairPath) {
    let resolvedPath = keypairPath;
    if (resolvedPath.startsWith('~')) resolvedPath = resolvedPath.replace(/^~/, homedir());
    resolvedPath = resolve(resolvedPath);
    const raw = await readFile(resolvedPath, 'utf-8');
    const secretKey = parseKeypairBytes(raw);
    const publicKey = nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
    return new ProxyGateClient({
      gatewayUrl,
      apiKey,
      walletAddress: encodeBase58(publicKey),
      secretKey,
    });
  }

  // Keypair only (existing behavior)
  if (keypairPath) {
    return ProxyGateClient.create({ gatewayUrl, keypairPath });
  }

  console.error(red('Error: Not configured. Run `proxygate login` or `proxygate init` first.'));
  console.error(dim('Or use --gateway and --keypair/--api-key flags.'));
  process.exit(1);
}
