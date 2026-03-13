import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { parseKeypair } from './keypair.js';

const seed = new Uint8Array(32).fill(42);
const keypair = nacl.sign.keyPair.fromSeed(seed);

describe('parseKeypair', () => {
  it('parses Solana CLI format (64-byte JSON array)', () => {
    const input = JSON.stringify(Array.from(keypair.secretKey));
    const result = parseKeypair(input);
    expect(result.secretKey).toEqual(Array.from(keypair.secretKey));
    expect(result.format).toContain('64-byte');
  });

  it('parses 32-byte seed JSON array and expands', () => {
    const input = JSON.stringify(Array.from(seed));
    const result = parseKeypair(input);
    expect(result.secretKey.length).toBe(64);
    // Verify it produces the same keypair
    expect(result.secretKey).toEqual(Array.from(keypair.secretKey));
    expect(result.format).toContain('seed');
  });

  it('parses base58 encoded 64-byte key', () => {
    // Encode the 64-byte secret key as base58
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    function encodeBase58(bytes: Uint8Array): string {
      let leadingZeros = 0;
      for (let i = 0; i < bytes.length && bytes[i] === 0; i++) leadingZeros++;
      let num = BigInt(0);
      for (const b of bytes) num = num * 256n + BigInt(b);
      const chars: string[] = [];
      while (num > 0n) { chars.unshift(ALPHABET[Number(num % 58n)]); num /= 58n; }
      for (let i = 0; i < leadingZeros; i++) chars.unshift('1');
      return chars.join('');
    }

    const b58 = encodeBase58(keypair.secretKey);
    const result = parseKeypair(b58);
    expect(result.secretKey).toEqual(Array.from(keypair.secretKey));
    expect(result.format).toContain('Base58');
  });

  it('parses base64 encoded 64-byte key', () => {
    const b64 = Buffer.from(keypair.secretKey).toString('base64');
    const result = parseKeypair(b64);
    expect(result.secretKey).toEqual(Array.from(keypair.secretKey));
    expect(result.format).toContain('Base64');
  });

  it('parses hex encoded 64-byte key', () => {
    const hex = Buffer.from(keypair.secretKey).toString('hex');
    const result = parseKeypair(hex);
    expect(result.secretKey).toEqual(Array.from(keypair.secretKey));
    expect(result.format).toContain('Hex');
  });

  it('rejects invalid input', () => {
    expect(() => parseKeypair('not a key')).toThrow('Unrecognized keypair format');
  });

  it('rejects JSON array with wrong length', () => {
    expect(() => parseKeypair('[1,2,3]')).toThrow('Expected 32 or 64');
  });
});
