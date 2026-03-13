import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import nacl from 'tweetnacl';
import { encodeBase58 } from '@proxygate/sdk';
import type { TunnelRegisteredListing } from '@proxygate/sdk';
import { bold, green, yellow, red, dim, cyan } from '../format.js';

/** Load and parse a Solana keypair JSON file, returning secretKey + walletAddress. */
export async function loadKeypair(keypairPath: string): Promise<{
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
export async function checkService(name: string, port: number): Promise<boolean> {
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
export function timestamp(): string {
  return dim(new Date().toISOString().replace('T', ' ').replace('Z', ''));
}

// ---------------------------------------------------------------------------
// Event handlers for tunnel client
// ---------------------------------------------------------------------------

/** Handle tunnel connected event -- display active listings. */
export function onConnected(listings: TunnelRegisteredListing[]): void {
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
}

/** Handle tunnel disconnected event. */
export function onDisconnected(reason: string): void {
  console.log(`${timestamp()} ${yellow('Disconnected:')} ${reason}`);
  console.log(dim('Reconnecting in 5s...'));
}

/** Handle tunnel error event. */
export function onError(error: Error): void {
  console.error(`${timestamp()} ${red('Error:')} ${error.message}`);
}

/** Handle tunnel request event. */
export function onRequest(requestId: string, service: string, path: string): void {
  console.log(
    `${timestamp()} ${green('>>>')} ${bold(service)} ${path} ${dim(requestId.slice(0, 8))}`,
  );
}
