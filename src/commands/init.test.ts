import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from './init.js';

const mockBalance = vi.fn();
const mockCreate = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

const mockSaveConfig = vi.fn();
vi.mock('../config.js', () => ({
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  CONFIG_PATH: '/home/test/.proxygate/config.json',
}));

const mockAccess = vi.fn();
vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
}));

describe('init command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default: file exists, client creation succeeds, balance succeeds
    mockAccess.mockResolvedValue(undefined);
    mockBalance.mockResolvedValue({ balance: 5_000_000 });
    mockCreate.mockResolvedValue({
      walletAddress: 'TestWallet11111111111111111111111111111111111',
      balance: (...args: unknown[]) => mockBalance(...args),
    });
    mockSaveConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runInit = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    registerInitCommand(program);
    await program.parseAsync(['node', 'proxygate', 'init', ...args]);
  };

  it('happy path: keypair exists, gateway reachable, config saved', async () => {
    await runInit('--keypair', '/tmp/test-key.json', '--gateway', 'http://localhost:3001');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('TestWallet1111');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('exits with error when keypair file not found', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      runInit('--keypair', '/nonexistent/key.json'),
    ).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Keypair file not found');
    expect(mockSaveConfig).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('saves config even when gateway is unreachable (non-fatal)', async () => {
    mockBalance.mockRejectedValue(new Error('ECONNREFUSED'));

    await runInit('--keypair', '/tmp/test-key.json', '--gateway', 'http://localhost:3001');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Could not connect to gateway');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('saves correct config with gatewayUrl and keypairPath', async () => {
    await runInit('--keypair', '/tmp/my-key.json', '--gateway', 'https://gw.example.com');

    expect(mockSaveConfig).toHaveBeenCalledWith({
      gatewayUrl: 'https://gw.example.com',
      keypairPath: '/tmp/my-key.json',
    });
  });

  it('expands tilde in keypair path', async () => {
    const { homedir } = await import('node:os');
    const home = homedir();

    await runInit('--keypair', '~/.config/solana/id.json');

    // The resolved path should use the actual home directory
    expect(mockAccess).toHaveBeenCalledWith(
      expect.stringContaining(`${home}/.config/solana/id.json`),
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        keypairPath: expect.stringContaining(`${home}/.config/solana/id.json`),
      }),
    );
  });

  it('uses custom --gateway flag value', async () => {
    await runInit('--keypair', '/tmp/test-key.json', '--gateway', 'https://custom-gw.io');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('https://custom-gw.io');
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayUrl: 'https://custom-gw.io' }),
    );
  });

  it('uses custom --keypair flag value', async () => {
    await runInit('--keypair', '/opt/keys/special.json');

    expect(mockAccess).toHaveBeenCalledWith('/opt/keys/special.json');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ keypairPath: '/opt/keys/special.json' }),
    );
  });

  it('exits with error when ProxyGateClient.create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Invalid keypair format'));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      runInit('--keypair', '/tmp/bad-key.json'),
    ).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Failed to load keypair');
    expect(errOutput).toContain('Invalid keypair format');
    expect(mockSaveConfig).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });
});
