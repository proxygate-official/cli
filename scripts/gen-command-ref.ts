/**
 * Thin runner for the CLI command-reference generator. The logic lives in
 * src/command-ref.ts (so the freshness test can import it from within rootDir).
 * Run: `pnpm --filter @proxygate/cli gen:command-ref`.
 */
import { writeCommandReference } from '../src/command-ref.js';

const count = await writeCommandReference();
console.log(`Wrote command reference to ${count} file(s).`);
