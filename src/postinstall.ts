#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { SKILLS } from './generated/skills.js';

const HOOK_SCRIPT_PATH = join(
  homedir(),
  '.claude',
  'skills',
  'pg-update',
  'scripts',
  'check-update.js',
);
const HOOK_MARKER = 'proxygate-update-check';

async function postinstall(): Promise<void> {
  const skillNames = Object.keys(SKILLS);
  if (skillNames.length === 0) return;

  // Only install skills if Claude Code is installed
  const claudeDir = join(homedir(), '.claude');
  try {
    await access(claudeDir);
  } catch {
    console.log('Tip: Install Claude Code skills with: proxygate skills install');
    return;
  }

  const baseDir = join(claudeDir, 'skills');
  let count = 0;

  for (const [skillName, files] of Object.entries(SKILLS)) {
    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = join(baseDir, skillName, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
    }
    count++;
  }

  // Register SessionStart hook for update checker
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  try {
    let settings: Record<string, unknown> = {};
    try {
      const raw = await readFile(settingsPath, 'utf-8');
      settings = JSON.parse(raw);
    } catch {
      // No existing settings
    }

    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    const sessionStartEntries = (hooks.SessionStart ?? []) as Array<{
      matcher?: string;
      hooks?: Array<{ type?: string; command?: string }>;
    }>;

    const isProxygateHook = (cmd: string | undefined): boolean =>
      !!cmd &&
      (cmd.includes(HOOK_MARKER) ||
        cmd.includes('check-update.sh') ||
        cmd.includes('check-update.js'));

    const filteredEntries = sessionStartEntries
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks ?? []).filter((h) => !isProxygateHook(h.command)),
      }))
      .filter((entry) => (entry.hooks ?? []).length > 0);

    filteredEntries.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: `node "${HOOK_SCRIPT_PATH}" # ${HOOK_MARKER}`,
        },
      ],
    });
    hooks.SessionStart = filteredEntries;
    settings.hooks = hooks;

    await mkdir(dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
  } catch {
    // Non-fatal
  }

  // Install statusline script
  const hooksDir = join(claudeDir, 'hooks');
  const statuslinePath = join(hooksDir, 'proxygate-statusline.js');
  await mkdir(hooksDir, { recursive: true });
  await writeFile(statuslinePath, STATUSLINE_SCRIPT, 'utf-8');

  // Register statusline in settings (only if not already ours)
  try {
    const raw = await readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const currentStatusline = settings.statusLine as { command?: string } | undefined;
    if (!currentStatusline?.command?.includes('proxygate-statusline')) {
      settings.statusLine = {
        type: 'command',
        command: `node "${statuslinePath}"`,
      };
      await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }
  } catch {
    // Non-fatal
  }

  console.log(`\x1b[32m+\x1b[0m Installed ${count} Proxygate skills to ${baseDir}`);
}

const STATUSLINE_SCRIPT = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
let input = '';
const timeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(timeout);
  try {
    const data = JSON.parse(input);
    const model = data.model?.display_name || 'Claude';
    const dir = path.basename(data.workspace?.current_dir || process.cwd());
    const remaining = data.context_window?.remaining_percentage;
    const claudeDir = path.join(os.homedir(), '.claude');
    const AUTO_COMPACT_BUFFER_PCT = 16.5;
    let ctx = '';
    if (remaining != null) {
      const usable = 100 - AUTO_COMPACT_BUFFER_PCT;
      const used = Math.min(100, Math.round(((usable - remaining) / usable) * 100));
      const blocks = 10;
      const filled = Math.round((used / 100) * blocks);
      const bar = String.fromCharCode(9608).repeat(filled) + String.fromCharCode(9617).repeat(blocks - filled);
      const color = used >= 90 ? '\\x1b[31m' : used >= 70 ? '\\x1b[33m' : '\\x1b[32m';
      ctx = \` \${color}\${bar} \${used}%\\x1b[0m\`;
    }
    let task = '';
    try {
      const stateFile = path.join(claudeDir, 'get-shit-done', 'STATE.json');
      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (state.current_task) task = state.current_task;
      }
    } catch (e) {}
    let gsdUpdate = '';
    const gsdCache = path.join(claudeDir, 'cache', 'gsd-update-check.json');
    if (fs.existsSync(gsdCache)) {
      try {
        const c = JSON.parse(fs.readFileSync(gsdCache, 'utf8'));
        if (c.update_available) gsdUpdate = '\\x1b[33m\\u2B06 /gsd:update\\x1b[0m \\u2502 ';
      } catch (e) {}
    }
    let pgUpdate = '';
    const pgCache = path.join(claudeDir, 'cache', 'proxygate-update-check.json');
    if (fs.existsSync(pgCache)) {
      try {
        const c = JSON.parse(fs.readFileSync(pgCache, 'utf8'));
        if (c.update_available) pgUpdate = '\\x1b[36m\\u2B06 /pg-update\\x1b[0m \\u2502 ';
      } catch (e) {}
    }
    const updates = gsdUpdate + pgUpdate;
    if (task) {
      process.stdout.write(\`\${updates}\\x1b[2m\${model}\\x1b[0m \\u2502 \\x1b[1m\${task}\\x1b[0m \\u2502 \\x1b[2m\${dir}\\x1b[0m\${ctx}\`);
    } else {
      process.stdout.write(\`\${updates}\\x1b[2m\${model}\\x1b[0m \\u2502 \\x1b[2m\${dir}\\x1b[0m\${ctx}\`);
    }
  } catch (e) {}
});
`;

postinstall().catch(() => {
  // Silent fail — postinstall should never block npm install
});
