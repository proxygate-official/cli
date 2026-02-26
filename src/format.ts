// ---------------------------------------------------------------------------
// ANSI color helpers (no external dependency)
// ---------------------------------------------------------------------------

/** Wrap text in ANSI bold. */
export function bold(text: string): string {
  return `\x1b[1m${text}\x1b[0m`;
}

/** Wrap text in ANSI dim. */
export function dim(text: string): string {
  return `\x1b[2m${text}\x1b[0m`;
}

/** Wrap text in ANSI green. */
export function green(text: string): string {
  return `\x1b[32m${text}\x1b[0m`;
}

/** Wrap text in ANSI red. */
export function red(text: string): string {
  return `\x1b[31m${text}\x1b[0m`;
}

/** Wrap text in ANSI cyan. */
export function cyan(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}

/** Wrap text in ANSI yellow. */
export function yellow(text: string): string {
  return `\x1b[33m${text}\x1b[0m`;
}

// ---------------------------------------------------------------------------
// Table formatting
// ---------------------------------------------------------------------------

/**
 * Format data as an aligned terminal table.
 *
 * Calculates column widths from headers and data rows, pads each cell,
 * and joins columns with double-space separators.
 *
 * @returns A string containing the header row, a separator row, and all data rows.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = row[i] ?? '';
      if (cell.length > max) {
        max = cell.length;
      }
    }
    return max;
  });

  const pad = (text: string, width: number): string =>
    text + ' '.repeat(Math.max(0, width - text.length));

  const headerLine = headers.map((h, i) => pad(h, widths[i])).join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  const dataLines = rows.map((row) =>
    headers.map((_, i) => pad(row[i] ?? '', widths[i])).join('  '),
  );

  return [headerLine, separator, ...dataLines].join('\n');
}

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

/**
 * Convert a micro-cents value to a human-readable dollar string.
 * Trims trailing zeros for cleaner display.
 *
 * @example
 * formatCurrency(1_500_000) // "$1.50"
 * formatCurrency(123)       // "$0.000123"
 */
export function formatCurrency(microCents: number): string {
  const dollars = microCents / 1_000_000;
  const raw = `$${dollars.toFixed(6)}`;

  // Trim trailing zeros but keep at least 2 decimal places
  const [whole, decimal] = raw.split('.');
  if (!decimal) return raw;

  let trimmed = decimal.replace(/0+$/, '');
  if (trimmed.length < 2) {
    trimmed = trimmed.padEnd(2, '0');
  }

  return `${whole}.${trimmed}`;
}

/**
 * Truncate a wallet address for display.
 *
 * @example
 * formatWallet('8Kag2c9vqVT...') // "8Kag...qVT7"
 */
export function formatWallet(wallet: string): string {
  if (wallet.length <= 11) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}
