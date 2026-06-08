import type { Command } from 'commander';

/**
 * The five program-wide options. Extracted from index.ts so the command-reference
 * generator (scripts/gen-command-ref.ts) applies the exact same global flags the
 * runtime does - they belong in the generated manual. The runtime lazy-load path
 * in index.ts is otherwise unchanged.
 */
export function registerGlobalOptions(program: Command): Command {
  return program
    .option('--gateway <url>', 'Override gateway URL (default: from config)')
    .option('--keypair <path>', 'Path to Solana keypair JSON file (default: from config)')
    .option('--api-key <key>', 'Override API key (default: from config)')
    .option('--json', 'Machine-readable JSON output (for scripting)')
    .option('--no-color', 'Disable colored output');
}
