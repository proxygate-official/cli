/**
 * Phase 60 Opt #2 — bundle + minify build.
 *
 * Replaces bare `tsc` emit. esbuild bundles src/ into a minified ESM entry
 * plus code-split chunks for every dynamic `import()` in the lazy command
 * registry — so Opt #1's lazy loading is preserved (each command is its own
 * chunk, loaded on demand) while ~hundreds of per-file fs module resolves
 * collapse into a handful of chunk reads.
 *
 * node_modules stay external (`packages: 'external'`): bundling
 * @walletconnect / tweetnacl / qrcode is high-risk for low gain — the
 * dominant cold-start cost is resolving OUR src tree, not the deps the
 * invoked command actually needs. Type checking is independent
 * (`pnpm typecheck` = tsc --noEmit), so dropping tsc emit loses nothing.
 */
import { build } from 'esbuild';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = new URL('../dist/', import.meta.url);

await build({
  entryPoints: ['src/index.ts', 'src/postinstall.ts'],
  outdir: 'dist',
  bundle: true,
  splitting: true, // code-split dynamic import() → preserves Opt #1 lazy load
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: true,
  sourcemap: true,
  packages: 'external', // resolve node_modules at runtime (low-risk)
  logLevel: 'warning',
});

// esbuild strips shebangs from inputs; re-add to the entry ONLY (chunks are
// import()ed, never executed directly — a shebang there is dead weight).
const entry = join(distDir.pathname, 'index.js');
const src = await readFile(entry, 'utf8');
if (!src.startsWith('#!')) {
  await writeFile(entry, `#!/usr/bin/env node\n${src}`);
}
await chmod(entry, 0o755);

console.log('esbuild: bundled dist/index.js (+ lazy chunks), minified');
