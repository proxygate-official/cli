import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findReferenceFiles, generateCommandReference } from './command-ref.js';

// The skill's command reference IS the agent's manual for the CLI. This gate
// regenerates it from the live Commander definitions and fails if any committed
// references/commands.md drifted - so a new flag/command can't ship undocumented.
// (It enforces the FLAG reference; SKILL.md narrative accuracy rests on other tests.)
describe('CLI command reference stays in sync with the CLI', () => {
  it('every references/commands.md matches the generator output', async () => {
    const expected = await generateCommandReference();
    const files = findReferenceFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const actual = readFileSync(file, 'utf-8');
      expect(actual, `\n${file} is stale. Run: pnpm --filter @proxygate/cli gen:command-ref\n`).toBe(expected);
    }
  });

  it('captures deeply-nested subcommands and their flags (recursive walk)', async () => {
    const ref = await generateCommandReference();
    expect(ref).toContain('proxygate listings docs <id>');
    expect(ref).toContain('--operation');
    expect(ref).toContain('--endpoint');
    expect(ref).toContain('--search');
  });
});
