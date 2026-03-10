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

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Manage Claude Code skills for ProxyGate');

  skills
    .command('install')
    .description('Install ProxyGate skills for Claude Code (writes to ~/.claude/skills/)')
    .option('--json', 'JSON output')
    .action(installSkills);
}

interface SkillInfo {
  name: string;
  files: string[];
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

  const baseDir = join(homedir(), '.claude', 'skills');
  const installed: SkillInfo[] = [];

  for (const [skillName, files] of Object.entries(SKILLS)) {
    const skillDir = join(baseDir, skillName);
    const writtenFiles: string[] = [];

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(skillDir, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      writtenFiles.push(relativePath);
    }

    installed.push({ name: skillName, files: writtenFiles });
  }

  const hookRegistered = await registerUpdateHook();

  if (json) {
    console.log(JSON.stringify({ installed, path: baseDir, hookRegistered }));
    return;
  }

  console.log();
  for (const skill of installed) {
    console.log(`  ${green('+')} ${skill.name} ${dim(`(${skill.files.length} files)`)}`);
  }
  if (hookRegistered) {
    console.log(`  ${green('+')} SessionStart hook ${dim('(update checker)')}`);
  }
  console.log();
  console.log(green(`Installed ${installed.length} skills to ${baseDir}`));
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
