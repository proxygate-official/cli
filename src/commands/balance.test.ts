import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerBalanceCommand } from './balance.js';

// Mock the SDK
const mockBalance = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      balance: (...args: unknown[]) => mockBalance(...args),
    }),
  },
  ProxyGateError: class ProxyGateError extends Error {
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

  it('outputs formatted balance by default', async () => {
    mockBalance.mockResolvedValue({
      balance: 1_500_000,
      total_deposited: 5_000_000,
      total_spent: 3_500_000,
      currency: 'micro_cents',
      usdc_equivalent: '5.00',
    });

    await runBalance();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Credit Balance');
    expect(output).toContain('$1.50');
    expect(output).toContain('$5.00');
    expect(output).toContain('$3.50');
  });

  it('outputs raw JSON with --json flag', async () => {
    const result = {
      balance: 1_500_000,
      total_deposited: 5_000_000,
      total_spent: 3_500_000,
      currency: 'micro_cents',
      usdc_equivalent: '5.00',
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
      total_deposited: 200,
      total_spent: 100,
      currency: 'micro_cents',
      usdc_equivalent: '0.00',
    });

    await runBalance('--json');

    const output = logSpy.mock.calls[0][0] as string;
    expect(output).not.toContain('\x1b[');
  });
});
