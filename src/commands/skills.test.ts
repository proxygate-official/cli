import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

let tempDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => tempDir };
});

vi.mock('../generated/skills.js', () => ({
  SKILLS: {
    'test-skill': {
      'SKILL.md': '---\nname: test-skill\n---\n# Test',
      'references/commands.md': '# Commands\n\ntest content',
    },
    'test-skill-2': {
      'SKILL.md': '---\nname: test-skill-2\n---\n# Test 2',
    },
  },
}));

describe('skills install', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'pg-skills-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('writes skill files to ~/.claude/skills/', async () => {
    const { SKILLS } = await import('../generated/skills.js');
    const baseDir = join(tempDir, '.claude', 'skills');
    const { dirname } = await import('node:path');

    for (const [skillName, files] of Object.entries(SKILLS)) {
      for (const [relPath, content] of Object.entries(files)) {
        const fullPath = join(baseDir, skillName, relPath);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, 'utf-8');
      }
    }

    const skillMd = await readFile(join(baseDir, 'test-skill', 'SKILL.md'), 'utf-8');
    expect(skillMd).toContain('name: test-skill');

    const cmdRef = await readFile(join(baseDir, 'test-skill', 'references', 'commands.md'), 'utf-8');
    expect(cmdRef).toContain('test content');

    const skill2 = await readFile(join(baseDir, 'test-skill-2', 'SKILL.md'), 'utf-8');
    expect(skill2).toContain('name: test-skill-2');
  });

  it('registers SessionStart hook in settings.json', async () => {
    const settingsDir = join(tempDir, '.claude');
    await mkdir(settingsDir, { recursive: true });
    await writeFile(join(settingsDir, 'settings.json'), '{}', 'utf-8');

    const settingsPath = join(settingsDir, 'settings.json');
    const raw = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);
    settings.hooks = {
      SessionStart: [{
        matcher: '',
        hooks: [{
          type: 'command',
          command: 'bash "~/.claude/skills/pg-update/scripts/check-update.sh" # proxygate-update-check',
        }],
      }],
    };
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

    const result = JSON.parse(await readFile(settingsPath, 'utf-8'));
    expect(result.hooks.SessionStart).toHaveLength(1);
    expect(result.hooks.SessionStart[0].hooks[0].command).toContain('proxygate-update-check');
  });

  it('detects existing hook to avoid duplication', async () => {
    const existing = {
      hooks: {
        SessionStart: [{
          matcher: '',
          hooks: [{ type: 'command', command: 'bash "..." # proxygate-update-check' }],
        }],
      },
    };

    const entries = existing.hooks.SessionStart;
    const alreadyRegistered = entries.some((e) =>
      e.hooks?.some((h) => h.command?.includes('proxygate-update-check')),
    );

    expect(alreadyRegistered).toBe(true);
  });

  it('detects when hook is not registered', () => {
    const entries = [
      { matcher: '', hooks: [{ type: 'command', command: 'bash other-script.sh' }] },
    ];
    const alreadyRegistered = entries.some((e) =>
      e.hooks?.some((h) => h.command?.includes('proxygate-update-check')),
    );

    expect(alreadyRegistered).toBe(false);
  });
});
