import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerWithdrawConfirmCommand } from './withdraw-confirm.js';

const mockWithdrawConfirm = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      vault: {
        withdrawConfirm: (...args: unknown[]) => mockWithdrawConfirm(...args),
      },
    }),
  },
  ProxygateError: class extends Error {
    code: string;
    action?: string;
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

const CONFIRM_RESULT = {
  balance: 8_000_000,
  withdrawn: 2_000_000,
  tx_signature: '5abc123xyz789txsig',
  currency: 'lamports',
};

describe('withdraw-confirm command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>')
      .option('--keypair <path>')
      .option('--json', 'Output raw JSON');
    registerWithdrawConfirmCommand(program);
    await program.parseAsync(['node', 'proxygate', 'withdraw-confirm', ...args]);
  };

  it('outputs formatted confirmation with TX and amounts', async () => {
    mockWithdrawConfirm.mockResolvedValue(CONFIRM_RESULT);
    await run('--tx', '5abc123xyz789txsig');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Withdrawal Confirmed');
    expect(output).toContain('2.000000 USDC');
    expect(output).toContain('8.000000 USDC');
    expect(output).toContain('5abc123xyz789txsig');
  });

  it('passes TX signature to client', async () => {
    mockWithdrawConfirm.mockResolvedValue(CONFIRM_RESULT);
    await run('--tx', 'my-tx-sig');

    expect(mockWithdrawConfirm).toHaveBeenCalledWith('my-tx-sig');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockWithdrawConfirm.mockResolvedValue(CONFIRM_RESULT);
    await run('--tx', '5abc123xyz789txsig', '--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(CONFIRM_RESULT);
  });
});
