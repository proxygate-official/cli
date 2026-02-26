import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerDepositCommand } from './deposit.js';

const mockDeposit = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      deposit: (...args: unknown[]) => mockDeposit(...args),
    }),
  },
  ProxyGateError: class extends Error {
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
    keypairPath: '/tmp/key.json',
  }),
}));

const DEPOSIT_RESULT = {
  balance: 6_500_000,
  deposited: 5_000_000,
  currency: 'micro_cents',
  usdc_equivalent: '5.00',
};

describe('deposit command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runDeposit = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>')
      .option('--keypair <path>')
      .option('--json', 'Output raw JSON');
    registerDepositCommand(program);
    await program.parseAsync(['node', 'proxygate', 'deposit', ...args]);
  };

  it('outputs formatted deposit result by default', async () => {
    mockDeposit.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Deposit Successful');
    expect(output).toContain('$5.00');
    expect(output).toContain('$6.50');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockDeposit.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(DEPOSIT_RESULT);
  });

  it('--json skips the yellow warning note', async () => {
    mockDeposit.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--json');

    const allOutput = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(allOutput).not.toContain('Note:');
    expect(allOutput).not.toContain('x402');
  });
});
