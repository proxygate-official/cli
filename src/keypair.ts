/**
 * Parse and convert Solana keypairs from various formats.
 *
 * Delegates core parsing to @proxygate/sdk's parseKeypairBytes.
 * Adds CLI-specific format detection labels for user display.
 *
 * Output: Solana-compatible JSON array of 64 numbers [secretKey(32) + publicKey(32)].
 */

import { parseKeypairBytes, decodeBase58 } from '@proxygate/sdk';

const BASE58_CHARS = new Set('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz');

function isBase58(str: string): boolean {
  for (const ch of str) { if (!BASE58_CHARS.has(ch)) return false; }
  return str.length > 0;
}

export interface ParseResult {
  secretKey: number[];
  format: string;
}

/** Detect the human-readable format label for CLI display. */
function detectFormat(raw: string): string {
  const trimmed = raw.trim();

  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        if (arr.length === 64) return 'Solana CLI keypair (64-byte JSON array)';
        if (arr.length === 32) return '32-byte seed (JSON array, expanded to keypair)';
      }
    } catch { /* fall through */ }
  }

  if (isBase58(trimmed) && trimmed.length >= 32 && trimmed.length <= 96) {
    const bytes = decodeBase58(trimmed);
    if (bytes.length === 64) return 'Base58 private key (64 bytes, e.g. Phantom export)';
    if (bytes.length === 32) return 'Base58 seed (32 bytes, expanded to keypair)';
  }

  if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed)) {
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (hex.length === 128) return 'Hex private key (64 bytes)';
    if (hex.length === 64) return 'Hex seed (32 bytes, expanded to keypair)';
  }

  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length >= 43) {
    const bytes = Buffer.from(trimmed, 'base64');
    if (bytes.length === 64) return 'Base64 private key (64 bytes)';
    if (bytes.length === 32) return 'Base64 seed (32 bytes, expanded to keypair)';
  }

  return 'Unknown format';
}

/**
 * Parse raw content (file contents or pasted string) into a 64-byte Solana keypair.
 * Throws descriptive errors for unsupported formats.
 */
export function parseKeypair(raw: string): ParseResult {
  const format = detectFormat(raw);
  const secretKey = parseKeypairBytes(raw);
  return { secretKey: Array.from(secretKey), format };
}
