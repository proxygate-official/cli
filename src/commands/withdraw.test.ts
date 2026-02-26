import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerWithdrawCommand } from './withdraw.js';

const mockWithdraw = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      withdraw: (...args: unknown[]) => mockWithdraw(...args),
    }),
  },
  ProxyGateError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

const WITHDRAW_RESULT = {
  tx_signature: 'tx_abc123def456',
  amount_withdrawn: 2_000_000,
  remaining_balance: 3_000_000,
  currency: 'micro_cents',
  usdc_withdrawn: '2.00',
};

describe('withdraw command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runWithdraw = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>')
      .option('--keypair <path>')
      .option('--json', 'Output raw JSON');
    registerWithdrawCommand(program);
    await program.parseAsync(['node', 'proxygate', 'withdraw', ...args]);
  };

  it('outputs formatted withdrawal result by default', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_RESULT);
    await runWithdraw('--amount', '2000000');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Withdrawal Successful');
    expect(output).toContain('$2.00');
    expect(output).toContain('$3.00');
    expect(output).toContain('tx_abc123def456');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_RESULT);
    await runWithdraw('--amount', '2000000', '--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(WITHDRAW_RESULT);
  });

  it('passes correct amount to client', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_RESULT);
    await runWithdraw('--amount', '5000000');

    expect(mockWithdraw).toHaveBeenCalledWith({ amount: 5_000_000 });
  });

  it('exits with error for invalid amount', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runWithdraw('--amount', '-100')).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(errOutput).toContain('positive integer');
    mockExit.mockRestore();
  });
});
