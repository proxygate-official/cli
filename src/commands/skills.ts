import type { Command } from 'commander';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SKILLS } from '../generated/skills.js';
import { green, dim, yellow } from '../format.js';

const HOOK_SCRIPT_PATH = join(
  homedir(),
  '.claude',
  'skills',
  'pg-update',
  'scripts',
  'check-update.sh',
);
const HOOK_MARKER = 'proxygate-update-check';

/** Skill install targets — Claude Code and Codex CLI use different directories. */
const SKILL_TARGETS = [
  { name: 'Claude Code', dir: join(homedir(), '.claude', 'skills') },
  { name: 'Codex CLI', dir: join(homedir(), '.agents', 'skills') },
] as const;

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Manage agent skills for Proxygate');

  skills
    .command('install')
    .description('Install Proxygate skills for Claude Code and Codex CLI')
    .option('--json', 'JSON output')
    .action(installSkills);
}

interface SkillInfo {
  name: string;
  files: string[];
}

interface TargetResult {
  target: string;
  path: string;
  installed: SkillInfo[];
}

async function installSkills(options: { json?: boolean }): Promise<void> {
  const json = !!options.json;
  const skillNames = Object.keys(SKILLS);

  if (skillNames.length === 0) {
    const msg = 'No skills bundled in this build. Rebuild with: pnpm build';
    if (json) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(msg);
    }
    process.exit(1);
  }

  const results: TargetResult[] = [];

  for (const target of SKILL_TARGETS) {
    const installed: SkillInfo[] = [];

    for (const [skillName, files] of Object.entries(SKILLS)) {
      const skillDir = join(target.dir, skillName);
      const writtenFiles: string[] = [];

      for (const [relativePath, content] of Object.entries(files)) {
        const fullPath = join(skillDir, relativePath);
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content, 'utf-8');
        writtenFiles.push(relativePath);
      }

      installed.push({ name: skillName, files: writtenFiles });
    }

    results.push({ target: target.name, path: target.dir, installed });
  }

  const hookRegistered = await registerUpdateHook();

  if (json) {
    console.log(JSON.stringify({ results, hookRegistered }));
    return;
  }

  console.log();
  for (const result of results) {
    console.log(`  ${dim(result.target)}:`);
    for (const skill of result.installed) {
      console.log(`    ${green('+')} ${skill.name} ${dim(`(${skill.files.length} files)`)}`);
    }
  }
  if (hookRegistered) {
    console.log(`  ${green('+')} SessionStart hook ${dim('(update checker)')}`);
  }
  console.log();
  console.log(green(`Installed ${results[0].installed.length} skills to ${results.length} targets`));
}

async function registerUpdateHook(): Promise<boolean> {
  const settingsPath = join(homedir(), '.claude', 'settings.json');

  try {
    let settings: Record<string, unknown> = {};
    try {
      const raw = await readFile(settingsPath, 'utf-8');
      settings = JSON.parse(raw);
    } catch {
      // No existing settings — start fresh
    }

    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    const sessionStartEntries = (hooks.SessionStart ?? []) as Array<{
      matcher?: string;
      hooks?: Array<{ type?: string; command?: string }>;
    }>;

    const alreadyRegistered = sessionStartEntries.some((entry) =>
      entry.hooks?.some(
        (h) =>
          h.command?.includes(HOOK_MARKER) ||
          h.command?.includes('check-update.sh'),
      ),
    );

    if (!alreadyRegistered) {
      sessionStartEntries.push({
        matcher: '',
        hooks: [
          {
            type: 'command',
            command: `bash "${HOOK_SCRIPT_PATH}" # ${HOOK_MARKER}`,
          },
        ],
      });
      hooks.SessionStart = sessionStartEntries;
      settings.hooks = hooks;
    }

    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    return true;
  } catch (error) {
    console.error(
      yellow('  ! Could not register update hook:'),
      (error as Error).message,
    );
    return false;
  }
}
