import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCreateCommand } from './create.js';

// Mock fs operations
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockAccess = vi.fn();
vi.mock('node:fs/promises', () => ({
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
}));

describe('create command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    // Target dir does not exist (ENOENT)
    mockAccess.mockRejectedValue(new Error('ENOENT'));
    // Template files — top-level returns dirs + files, sub-dir returns files only
    mockReaddir
      .mockResolvedValueOnce([
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'package.json', isDirectory: () => false, isFile: () => true },
        { name: 'proxygate.tunnel.yaml', isDirectory: () => false, isFile: () => true },
        { name: 'README.md', isDirectory: () => false, isFile: () => true },
        { name: 'tsconfig.json', isDirectory: () => false, isFile: () => true },
      ])
      .mockResolvedValue([
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
      ]);
    mockReadFile.mockResolvedValue('{{name}} at port {{port}} costs {{price}}');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runCreate = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    registerCreateCommand(program);
    await program.parseAsync(['node', 'proxygate', 'create', ...args]);
  };

  it('non-interactive: creates project with all flags', async () => {
    await runCreate('my-agent', '--template', 'http-api', '--port', '4000', '--price', '2000');

    // Should create project directory
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining('my-agent'),
      expect.objectContaining({ recursive: true }),
    );

    // Should write files with placeholders replaced
    const writeCall = mockWriteFile.mock.calls.find(
      (c: unknown[]) => typeof c[1] === 'string' && (c[1] as string).includes('my-agent'),
    );
    expect(writeCall).toBeDefined();
    expect(writeCall![1]).toContain('my-agent');
    expect(writeCall![1]).toContain('4000');
    expect(writeCall![1]).toContain('2000');
    expect(writeCall![1]).not.toContain('{{name}}');
  });

  it('exits with error if target directory already exists', async () => {
    mockAccess.mockResolvedValue(undefined); // dir exists

    const exitCalls: number[] = [];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalls.push(code as number);
      return undefined as never;
    });

    await runCreate('existing-dir', '--template', 'http-api');

    expect(exitCalls).toContain(1);
    const errOutput = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(errOutput).toContain('already exists');
    mockExit.mockRestore();
  });

  it('exits with error for unknown template', async () => {
    const exitCalls: number[] = [];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalls.push(code as number);
      return undefined as never;
    });

    await runCreate('my-agent', '--template', 'nonexistent');

    expect(exitCalls).toContain(1);
    const errOutput = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(errOutput).toContain('Unknown template');
    mockExit.mockRestore();
  });

  it('shows next steps after creation', async () => {
    await runCreate('my-agent', '--template', 'http-api');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('cd my-agent');
    expect(output).toContain('npm install');
    expect(output).toContain('proxygate tunnel');
  });
});
