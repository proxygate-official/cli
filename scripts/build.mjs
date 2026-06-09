/**
 * Phase 60 Opt #2 — bundle + minify build.
 *
 * Replaces bare `tsc` emit. esbuild bundles src/ into a minified ESM entry
 * plus code-split chunks for every dynamic `import()` in the lazy command
 * registry — so Opt #1's lazy loading is preserved (each command is its own
 * chunk, loaded on demand) while ~hundreds of per-file fs module resolves
 * collapse into a handful of chunk reads.
 *
 * Externals = the package.json `dependencies` ONLY. Those exist in the
 * consumer's node_modules, so resolving them at runtime is safe and keeps
 * @walletconnect / tweetnacl / qrcode out of the bundle. Everything else —
 * crucially the PRIVATE workspace packages (@proxygate/api-types,
 * openapi-parser, graphql-parser) that live in devDependencies and never
 * reach npm — gets bundled in. `packages: 'external'` (the previous setting)
 * left those as bare imports too: the workspace symlink resolved them in
 * every local gate, but the published tarball crashed with
 * ERR_MODULE_NOT_FOUND on exactly the proxy/listings chunks (0.10.0).
 */
import { build } from 'esbuild';
import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const distDir = new URL('../dist/', import.meta.url);

// esbuild does not clean: stale chunks from previous builds would ship in the
// npm tarball (dist/** is the published artifact). Start from empty.
await rm(distDir, { recursive: true, force: true });

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const runtimeDeps = Object.keys(pkg.dependencies ?? {});
// esbuild `external` is exact-match per entry; add a /* twin for subpath imports.
const external = runtimeDeps.flatMap((d) => [d, `${d}/*`]);

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
  external,
  // Bundled CJS deps (via the workspace parsers) require() node builtins at
  // runtime; ESM output has no `require`. createRequire in every output file
  // restores it (the esbuild-documented fix for "Dynamic require of X").
  banner: {
    js: "import { createRequire as __cliCreateRequire } from 'node:module'; const require = globalThis.require ?? __cliCreateRequire(import.meta.url);",
  },
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
