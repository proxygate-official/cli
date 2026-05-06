import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBalance = vi.fn();
const mockConstructor = vi.fn();

vi.mock('@proxygate/sdk', () => {
  class MockClient {
    constructor(...args: unknown[]) {
      mockConstructor(...args);
    }
    balance = mockBalance;
  }
  return {
    ProxygateClient: MockClient,
    ProxygateError: class ProxygateError extends Error {
      statusCode: number;
      action?: string;
      constructor(body: { error: string; message: string; action?: string }, statusCode: number) {
        super(body.message);
        this.statusCode = statusCode;
        this.action = body.action;
      }
    },
  };
});

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  CONFIG_PATH: '~/.proxygate/config.json',
}));

vi.mock('../format.js', () => ({
  green: (s: string) => s,
  red: (s: string) => s,
  yellow: (s: string) => s,
  dim: (s: string) => s,
  formatUsdc: (n: number) => `${n} USDC`,
}));

import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config.js';
import { registerLoginCommand } from './login.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockSaveConfig = vi.mocked(saveConfig);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerLoginCommand', () => {
  it('registers login command without throwing', () => {
    const program = new Command();
    expect(() => registerLoginCommand(program)).not.toThrow();
  });

  it('rejects keys that do not start with pg_live_', async () => {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    mockLoadConfig.mockResolvedValue(null);
    await expect(
      program.parseAsync(['login', '--key', 'bad_key_12345678901234'], { from: 'user' }),
    ).rejects.toThrow('process.exit');

    expect(mockSaveConfig).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('rejects keys shorter than 20 characters', async () => {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    mockLoadConfig.mockResolvedValue(null);
    await expect(
      program.parseAsync(['login', '--key', 'pg_live_short'], { from: 'user' }),
    ).rejects.toThrow('process.exit');

    expect(mockSaveConfig).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('saves valid key to config after successful balance check', async () => {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);

    mockLoadConfig.mockResolvedValue(null);
    mockBalance.mockResolvedValue({ balance: 5_000_000 });
    mockSaveConfig.mockResolvedValue(undefined);

    await program.parseAsync(['login', '--key', 'pg_live_test_key_1234567890'], { from: 'user' });

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'pg_live_test_key_1234567890',
        gatewayUrl: 'https://gateway.proxygate.ai',
      }),
    );
  });

  it('saves key even when gateway is unreachable', async () => {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);

    mockLoadConfig.mockResolvedValue(null);
    mockBalance.mockRejectedValue(new Error('fetch failed'));
    mockSaveConfig.mockResolvedValue(undefined);

    await program.parseAsync(['login', '--key', 'pg_live_test_key_1234567890'], { from: 'user' });

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'pg_live_test_key_1234567890' }),
    );
  });

  it('preserves existing keypairPath from config', async () => {
    const program = new Command();
    program.exitOverride();
    registerLoginCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://saved-gw',
      keypairPath: '/keys/id.json',
    });
    mockBalance.mockResolvedValue({ balance: 0 });
    mockSaveConfig.mockResolvedValue(undefined);

    await program.parseAsync(['login', '--key', 'pg_live_test_key_1234567890'], { from: 'user' });

    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        keypairPath: '/keys/id.json',
        apiKey: 'pg_live_test_key_1234567890',
      }),
    );
  });
});
