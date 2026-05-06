import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerBalanceCommand } from './balance.js';

// Mock the SDK with vault.balance() pattern
const mockBalance = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      vault: {
        balance: (...args: unknown[]) => mockBalance(...args),
      },
    }),
  },
  ProxygateError: class ProxygateError extends Error {
    code: string;
    action?: string;
    constructor(msg: string, code: string, action?: string) {
      super(msg);
      this.code = code;
      this.action = action;
    }
  },
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/test-key.json',
  }),
}));

describe('balance command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runBalance = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>', 'Override gateway URL')
      .option('--keypair <path>', 'Override keypair path')
      .option('--json', 'Output raw JSON');
    registerBalanceCommand(program);
    await program.parseAsync(['node', 'proxygate', 'balance', ...args]);
  };

  it('outputs formatted vault balance with breakdown', async () => {
    mockBalance.mockResolvedValue({
      balance: 3_500_000,
      pending_settlement: 250_000,
      available: 3_250_000,
      in_cooldown: false,
      currency: 'lamports',
    });

    await runBalance();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Vault Balance');
    expect(output).toContain('3.500000 USDC');
    expect(output).toContain('0.250000 USDC');
    expect(output).toContain('3.250000 USDC');
    expect(output).toContain('Cooldown:');
    expect(output).toContain('No');
  });

  it('shows cooldown status when in cooldown', async () => {
    mockBalance.mockResolvedValue({
      balance: 3_500_000,
      pending_settlement: 250_000,
      available: 3_250_000,
      in_cooldown: true,
      currency: 'lamports',
    });

    await runBalance();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Cooldown:');
    expect(output).toContain('Yes');
  });

  it('outputs raw JSON with --json flag', async () => {
    const result = {
      balance: 3_500_000,
      pending_settlement: 250_000,
      available: 3_250_000,
      in_cooldown: false,
      currency: 'lamports',
    };
    mockBalance.mockResolvedValue(result);

    await runBalance('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });

  it('--json output does not contain ANSI codes', async () => {
    mockBalance.mockResolvedValue({
      balance: 100,
      pending_settlement: 0,
      available: 100,
      in_cooldown: false,
      currency: 'lamports',
    });

    await runBalance('--json');

    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('\x1b[');
  });
});
