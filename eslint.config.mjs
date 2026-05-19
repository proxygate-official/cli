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
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
