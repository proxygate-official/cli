/**
 * Parse and convert Solana keypairs from various formats.
 *
 * Supported input formats:
 * - JSON array of 64 numbers (Solana CLI: solana-keygen)
 * - JSON array of 32 numbers (seed only)
 * - Base58 string, 64 bytes decoded (Phantom private key export)
 * - Base58 string, 32 bytes decoded (seed)
 * - Raw base64 string, 64 bytes decoded
 * - Raw base64 string, 32 bytes decoded
 *
 * Output: Solana-compatible JSON array of 64 numbers [secretKey(32) + publicKey(32)].
 */

import nacl from 'tweetnacl';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_SET = new Set(BASE58_ALPHABET);
const BASE58_MAP = new Map<string, number>();
for (let i = 0; i < BASE58_ALPHABET.length; i++) {
  BASE58_MAP.set(BASE58_ALPHABET[i], i);
}

function decodeBase58(str: string): Uint8Array {
  let leadingOnes = 0;
  for (let i = 0; i < str.length && str[i] === '1'; i++) leadingOnes++;
  let num = BigInt(0);
  for (let i = 0; i < str.length; i++) {
    const v = BASE58_MAP.get(str[i]);
    if (v === undefined) throw new Error(`Invalid base58 character: ${str[i]}`);
    num = num * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (num > 0n) { bytes.unshift(Number(num % 256n)); num /= 256n; }
  for (let i = 0; i < leadingOnes; i++) bytes.unshift(0);
  return Uint8Array.from(bytes);
}

function isBase58(str: string): boolean {
  for (const ch of str) { if (!BASE58_SET.has(ch)) return false; }
  return str.length > 0;
}

function isBase64(str: string): boolean {
  return /^[A-Za-z0-9+/]+=*$/.test(str) && str.length > 0;
}

function keypairFromSeed(seed: Uint8Array): Uint8Array {
  const kp = nacl.sign.keyPair.fromSeed(seed);
  return kp.secretKey; // 64 bytes: seed(32) + pubkey(32)
}

export interface ParseResult {
  secretKey: number[];
  format: string;
}

/**
 * Parse raw content (file contents or pasted string) into a 64-byte Solana keypair.
 * Throws descriptive errors for unsupported formats.
 */
export function parseKeypair(raw: string): ParseResult {
  const trimmed = raw.trim();

  // 1. JSON array
  if (trimmed.startsWith('[')) {
    try {
      const arr: unknown = JSON.parse(trimmed);
      if (!Array.isArray(arr) || !arr.every((n) => typeof n === 'number' && n >= 0 && n <= 255)) {
        throw new Error('JSON array must contain numbers 0-255');
      }

      if (arr.length === 64) {
        return { secretKey: arr as number[], format: 'Solana CLI keypair (64-byte JSON array)' };
      }
      if (arr.length === 32) {
        const full = keypairFromSeed(Uint8Array.from(arr as number[]));
        return { secretKey: Array.from(full), format: '32-byte seed (JSON array, expanded to keypair)' };
      }
      throw new Error(`Expected 32 or 64 numbers, got ${arr.length}`);
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error('Invalid JSON in keypair file');
      throw err;
    }
  }

  // 2. Base58 string (Phantom export, etc.)
  if (isBase58(trimmed) && trimmed.length >= 32 && trimmed.length <= 96) {
    const bytes = decodeBase58(trimmed);

    if (bytes.length === 64) {
      return { secretKey: Array.from(bytes), format: 'Base58 private key (64 bytes, e.g. Phantom export)' };
    }
    if (bytes.length === 32) {
      const full = keypairFromSeed(bytes);
      return { secretKey: Array.from(full), format: 'Base58 seed (32 bytes, expanded to keypair)' };
    }
    // Could be a public key (32 bytes are valid base58 at shorter lengths)
    throw new Error(`Base58 decoded to ${bytes.length} bytes. Expected 32 (seed) or 64 (keypair).`);
  }

  // 3. Hex string (check before base64, since hex chars are valid base64)
  if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed)) {
    const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (hex.length === 128 || hex.length === 64) {
      const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
      if (bytes.length === 64) {
        return { secretKey: Array.from(bytes), format: 'Hex private key (64 bytes)' };
      }
      if (bytes.length === 32) {
        const full = keypairFromSeed(bytes);
        return { secretKey: Array.from(full), format: 'Hex seed (32 bytes, expanded to keypair)' };
      }
    }
  }

  // 4. Base64 string
  if (isBase64(trimmed) && trimmed.length >= 43) {
    const bytes = Uint8Array.from(Buffer.from(trimmed, 'base64'));

    if (bytes.length === 64) {
      return { secretKey: Array.from(bytes), format: 'Base64 private key (64 bytes)' };
    }
    if (bytes.length === 32) {
      const full = keypairFromSeed(bytes);
      return { secretKey: Array.from(full), format: 'Base64 seed (32 bytes, expanded to keypair)' };
    }
    throw new Error(`Base64 decoded to ${bytes.length} bytes. Expected 32 (seed) or 64 (keypair).`);
  }

  throw new Error(
    'Unrecognized keypair format. Supported formats:\n' +
    '  - JSON array of 64 numbers (Solana CLI)\n' +
    '  - JSON array of 32 numbers (seed)\n' +
    '  - Base58 string (Phantom export)\n' +
    '  - Base64 string\n' +
    '  - Hex string',
  );
}
