#!/usr/bin/env node
// Proxygate update checker — runs on Claude Code SessionStart.
// Cross-platform Node port of check-update.sh.
// Writes result to ~/.claude/cache/proxygate-update-check.json.
// Exits quickly; never blocks session startup.

const { execFileSync } = require('node:child_process');
const { mkdirSync, statSync, writeFileSync, existsSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const CACHE_DIR = join(homedir(), '.claude', 'cache');
const CACHE_FILE = join(CACHE_DIR, 'proxygate-update-check.json');
const ONE_HOUR_MS = 60 * 60 * 1000;

function safeExec(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    }).trim();
  } catch {
    return '';
  }
}

function main() {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    return;
  }

  if (existsSync(CACHE_FILE)) {
    try {
      const age = Date.now() - statSync(CACHE_FILE).mtimeMs;
      if (age < ONE_HOUR_MS) return;
    } catch {
      // fall through and re-check
    }
  }

  const current = safeExec('proxygate', ['--version']) || '0.0.0';
  const latest = safeExec('npm', ['view', '@proxygate/cli', 'version']) || '0.0.0';
  const checkedAt = new Date().toISOString();

  const updateAvailable = current !== latest && latest !== '0.0.0' && current !== '0.0.0';
  const payload = { update_available: updateAvailable, current, latest, checked_at: checkedAt };

  try {
    writeFileSync(CACHE_FILE, JSON.stringify(payload), 'utf-8');
  } catch {
    return;
  }

  if (updateAvailable) {
    process.stdout.write(`Proxygate update available: ${current} → ${latest}. Run /pg-update to upgrade.\n`);
  }
}

try {
  main();
} catch {
  // Never block session startup
}
