import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerTunnelCommand } from './tunnel.js';

vi.mock('@proxygate/sdk', () => ({
  Proxygate: {
    serve: vi.fn(),
  },
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

vi.mock('js-yaml', () => ({
  default: { load: vi.fn() },
}));

describe('tunnel command', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let mockExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('process.exit'); });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>').option('--keypair <path>');
    registerTunnelCommand(program);
    await program.parseAsync(['node', 'proxygate', 'tunnel', ...args]);
  };

  it('exits with error when config file not found', async () => {
    await expect(run('-c', '/nonexistent/config.yaml')).rejects.toThrow('process.exit');

    const output = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Cannot read tunnel config');
    mockExit.mockRestore();
  });

  it('exits when no config and no flags', async () => {
    const { loadConfig } = await import('../config.js');
    (loadConfig as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    await expect(run()).rejects.toThrow('process.exit');
    mockExit.mockRestore();
  });
});
