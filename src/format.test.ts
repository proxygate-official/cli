import { describe, it, expect } from 'vitest';
import {
  bold,
  dim,
  green,
  red,
  cyan,
  yellow,
  formatTable,
  formatCurrency,
  formatWallet,
} from './format.js';

describe('ANSI helpers', () => {
  it('bold wraps text with bold escape codes', () => {
    expect(bold('hello')).toBe('\x1b[1mhello\x1b[0m');
  });

  it('dim wraps text with dim escape codes', () => {
    expect(dim('hello')).toBe('\x1b[2mhello\x1b[0m');
  });

  it('green wraps text with green escape codes', () => {
    expect(green('hello')).toBe('\x1b[32mhello\x1b[0m');
  });

  it('red wraps text with red escape codes', () => {
    expect(red('hello')).toBe('\x1b[31mhello\x1b[0m');
  });

  it('cyan wraps text with cyan escape codes', () => {
    expect(cyan('hello')).toBe('\x1b[36mhello\x1b[0m');
  });

  it('yellow wraps text with yellow escape codes', () => {
    expect(yellow('hello')).toBe('\x1b[33mhello\x1b[0m');
  });
});

describe('formatTable', () => {
  it('produces aligned header, separator, and data rows', () => {
    const result = formatTable(
      ['Name', 'Price'],
      [
        ['OpenAI', '$1.50'],
        ['Anthropic', '$2.00'],
      ],
    );
    const lines = result.split('\n');
    expect(lines).toHaveLength(4); // header + separator + 2 rows
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Price');
    expect(lines[1]).toMatch(/^-+\s{2}-+$/);
    expect(lines[2]).toContain('OpenAI');
    expect(lines[3]).toContain('Anthropic');
  });

  it('handles empty rows', () => {
    const result = formatTable(['Col1', 'Col2'], []);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2); // header + separator only
  });

  it('handles single column', () => {
    const result = formatTable(['ID'], [['abc'], ['def']]);
    const lines = result.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[2]).toContain('abc');
    expect(lines[3]).toContain('def');
  });

  it('pads columns to widest cell', () => {
    const result = formatTable(['X'], [['short'], ['a much longer value']]);
    const lines = result.split('\n');
    // Separator should be as wide as the longest cell
    expect(lines[1].length).toBe('a much longer value'.length);
  });
});

describe('formatCurrency', () => {
  it('converts micro-cents to dollars (1_500_000 -> "$1.50")', () => {
    expect(formatCurrency(1_500_000)).toBe('$1.50');
  });

  it('trims trailing zeros but keeps at least 2 decimals', () => {
    expect(formatCurrency(1_000_000)).toBe('$1.00');
  });

  it('handles small values (123 -> "$0.000123")', () => {
    expect(formatCurrency(123)).toBe('$0.000123');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('formatWallet', () => {
  it('truncates long wallets', () => {
    const wallet = '8Kag2c9vqVTabcdefgh';
    expect(formatWallet(wallet)).toBe('8Kag...efgh');
  });

  it('passes through short wallets unchanged', () => {
    expect(formatWallet('short')).toBe('short');
  });

  it('passes through wallets of exactly 11 chars unchanged', () => {
    expect(formatWallet('12345678901')).toBe('12345678901');
  });

  it('truncates wallets of 12 chars', () => {
    expect(formatWallet('123456789012')).toBe('1234...9012');
  });
});
