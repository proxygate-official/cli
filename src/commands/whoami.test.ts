import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockBalance = vi.fn();
const mockCreate = vi.fn();

vi.mock('@proxygate/sdk', () => {
  class MockClient {
    walletAddress = 'TestWallet123';
    balance = mockBalance;
    static create(...args: unknown[]): MockClient {
      mockCreate(...args);
      return new MockClient();
    }
  }
  return {
    ProxygateClient: MockClient,
    ProxygateError: class extends Error {
      constructor(msg: string) {
        super(msg);
      }
    },
  };
});

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  CONFIG_PATH: '~/.proxygate/config.json',
}));

vi.mock('../helpers.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../format.js', () => ({
  bold: (s: string) => s,
  green: (s: string) => s,
  dim: (s: string) => s,
  yellow: (s: string) => s,
  formatUsdc: (n: number) => `${n} USDC`,
}));

import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getClient } from '../helpers.js';
import { registerWhoamiCommand } from './whoami.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockGetClient = vi.mocked(getClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerWhoamiCommand', () => {
  it('registers whoami command without throwing', () => {
    const program = new Command();
    expect(() => registerWhoamiCommand(program)).not.toThrow();
  });

  it('exits when not configured', async () => {
    const program = new Command();
    program.exitOverride();
    registerWhoamiCommand(program);

    mockLoadConfig.mockResolvedValue(null);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      program.parseAsync(['whoami'], { from: 'user' }),
    ).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });

  it('shows API key auth mode when only apiKey', async () => {
    const program = new Command();
    program.exitOverride();
    registerWhoamiCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      apiKey: 'pg_live_test_key_1234567890',
    });
    mockGetClient.mockResolvedValue({ balance: vi.fn().mockRejectedValue(new Error('offline')) } as never);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await program.parseAsync(['whoami'], { from: 'user' });

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('API key');
    expect(output).toContain('pg_live_test');
    spy.mockRestore();
  });

  it('shows keypair auth mode when only keypairPath', async () => {
    const program = new Command();
    program.exitOverride();
    registerWhoamiCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      keypairPath: '/keys/id.json',
    });
    mockGetClient.mockResolvedValue({ balance: vi.fn().mockRejectedValue(new Error('offline')) } as never);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await program.parseAsync(['whoami'], { from: 'user' });

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Keypair');
    expect(output).toContain('TestWallet123');
    spy.mockRestore();
  });

  it('shows dual auth mode when both present', async () => {
    const program = new Command();
    program.exitOverride();
    registerWhoamiCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      keypairPath: '/keys/id.json',
      apiKey: 'pg_live_test_key_1234567890',
    });
    mockGetClient.mockResolvedValue({ balance: vi.fn().mockRejectedValue(new Error('offline')) } as never);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await program.parseAsync(['whoami'], { from: 'user' });

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Dual');
    spy.mockRestore();
  });
});
