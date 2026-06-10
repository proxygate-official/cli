import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerDepositCommand } from './deposit.js';

const mockDeposit = vi.fn();
const mockTopup = vi.fn();

const { MockProxygateError } = vi.hoisted(() => ({
  MockProxygateError: class extends Error {
    code: string;
    statusCode: number;
    action?: string;
    constructor(msg: string, code: string, statusCode = 0, action?: string) {
      super(msg);
      this.code = code;
      this.statusCode = statusCode;
      this.action = action;
    }
  },
}));

vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      vault: {
        deposit: (...args: unknown[]) => mockDeposit(...args),
        topupX402: (...args: unknown[]) => mockTopup(...args),
      },
    }),
  },
  ProxygateError: MockProxygateError,
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

const DEPOSIT_RESULT = {
  balance: 3_500_000,
  deposited: 1_000_000,
  tx_signature: '5abcXYZ123def456ghi789jkl012mno345pqr678stu901vwx234yz567abc890',
  currency: 'lamports',
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

  it('outputs formatted vault deposit result by default', async () => {
    mockTopup.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--amount', '1000000');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Vault Deposit');
    expect(output).toContain('5abcXYZ123def456');
    expect(output).toContain('1.000000 USDC');
    expect(output).toContain('3.500000 USDC');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockTopup.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--amount', '1000000', '--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(DEPOSIT_RESULT);
  });

  it('uses the gasless topup path by default', async () => {
    mockTopup.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--amount', '5000000', '--yes');

    expect(mockTopup).toHaveBeenCalledWith({ amount: 5_000_000 });
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('falls back to self-paid deposit when the rail is off (503)', async () => {
    mockTopup.mockRejectedValue(new MockProxygateError('rail off', 'rail_disabled', 503));
    mockDeposit.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--amount', '1000000');

    expect(mockTopup).toHaveBeenCalledWith({ amount: 1_000_000 });
    expect(mockDeposit).toHaveBeenCalledWith({ amount: 1_000_000 });
  });

  it('does not fall back when topup fails for a non-503 reason', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    mockTopup.mockRejectedValue(new MockProxygateError('boom', 'internal', 500));

    await expect(runDeposit('--amount', '1000000')).rejects.toThrow('process.exit');

    expect(mockTopup).toHaveBeenCalledTimes(1);
    expect(mockDeposit).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('forces the self-paid deposit path with --legacy', async () => {
    mockDeposit.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--amount', '1000000', '--legacy');

    expect(mockDeposit).toHaveBeenCalledWith({ amount: 1_000_000 });
    expect(mockTopup).not.toHaveBeenCalled();
  });

  it('passes rpc option to the gasless path when provided', async () => {
    mockTopup.mockResolvedValue(DEPOSIT_RESULT);
    await runDeposit('--amount', '1000000', '--rpc', 'https://my-rpc.com');

    expect(mockTopup).toHaveBeenCalledWith({
      amount: 1_000_000,
      rpcUrl: 'https://my-rpc.com',
    });
  });

  it('exits with error for invalid amount', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runDeposit('--amount', '-100')).rejects.toThrow('process.exit');

    const errOutput = vi.spyOn(console, 'error').mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(errOutput).toContain('positive integer');
    mockExit.mockRestore();
  });
});
