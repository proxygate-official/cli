import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

// @proxygate/cli lint baseline (CI-health, 2026-05-19).
// typescript-eslint `recommended` (non-type-checked) — same canonical
// best-practice baseline as @proxygate/sdk. The CLI is a terminal tool:
// `console` is its output channel and is intentionally allowed.
// Genuine issues are fixed in source; no rule hides a real bug.
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "templates/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Idiomatic "intentionally unused" marker: a leading underscore.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    rules: {
      // `any` is banned everywhere — source AND tests.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Node build tooling (esbuild bundler, skill embedder) — not shipped
    // library code. Runs in Node, so expose Node globals instead of
    // false `no-undef` from the browser-agnostic base.
    files: ["scripts/**"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        fetch: "readonly",
        globalThis: "readonly",
      },
    },
  },
);
