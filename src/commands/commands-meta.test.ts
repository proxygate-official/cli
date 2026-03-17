import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCommandsMetaCommand } from './commands-meta.js';

describe('commands-meta command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (): Promise<void> => {
    const program = new Command('proxygate');
    registerCommandsMetaCommand(program);
    await program.parseAsync(['node', 'proxygate', 'commands']);
  };

  it('outputs valid JSON with commands array', async () => {
    await run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as { commands: unknown[]; total: number };
    expect(Array.isArray(parsed.commands)).toBe(true);
    expect(parsed.total).toBe(parsed.commands.length);
  });

  it('each command has required fields', async () => {
    await run();

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      commands: Array<{ name: string; description: string; auth_required: boolean; json_output: boolean }>;
    };

    for (const cmd of parsed.commands) {
      expect(cmd).toHaveProperty('name');
      expect(cmd).toHaveProperty('description');
      expect(typeof cmd.auth_required).toBe('boolean');
      expect(typeof cmd.json_output).toBe('boolean');
    }
  });

  it('includes key commands', async () => {
    await run();

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as {
      commands: Array<{ name: string }>;
    };
    const names = parsed.commands.map((c) => c.name);

    expect(names).toContain('proxy');
    expect(names).toContain('balance');
    expect(names).toContain('deposit');
    expect(names).toContain('pricing');
    expect(names).toContain('tunnel');
  });
});
