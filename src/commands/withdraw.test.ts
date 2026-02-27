import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerWithdrawCommand } from './withdraw.js';

const mockWithdraw = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      vault: {
        withdraw: (...args: unknown[]) => mockWithdraw(...args),
      },
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

const WITHDRAW_COOLDOWN_RESULT = {
  status: 'cooldown_started' as const,
  message: 'Settling pending calls. Cooldown started (60 seconds).',
  cooldown_ms: 60_000,
  unsettled_calls: 3,
};

const WITHDRAW_READY_RESULT = {
  status: 'ready' as const,
  message: 'No pending calls. You may withdraw on-chain after cooldown expires.',
  cooldown_ms: 60_000,
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

  it('outputs formatted cooldown result when unsettled calls exist', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_COOLDOWN_RESULT);
    await runWithdraw();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Vault Withdrawal');
    expect(output).toContain('Cooldown started (60 seconds)');
    expect(output).toContain('3 calls being settled');
  });

  it('outputs formatted ready result when no unsettled calls', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_READY_RESULT);
    await runWithdraw();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Vault Withdrawal');
    expect(output).toContain('Ready to withdraw on-chain');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_COOLDOWN_RESULT);
    await runWithdraw('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(WITHDRAW_COOLDOWN_RESULT);
  });

  it('passes amount when provided', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_READY_RESULT);
    await runWithdraw('--amount', '2000000');

    expect(mockWithdraw).toHaveBeenCalledWith({ amount: 2_000_000 });
  });

  it('calls withdraw without amount when omitted (withdraw all)', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_READY_RESULT);
    await runWithdraw();

    expect(mockWithdraw).toHaveBeenCalledWith({});
  });

  it('passes rpc option when provided', async () => {
    mockWithdraw.mockResolvedValue(WITHDRAW_READY_RESULT);
    await runWithdraw('--amount', '1000000', '--rpc', 'https://my-rpc.com');

    expect(mockWithdraw).toHaveBeenCalledWith({
      amount: 1_000_000,
      rpcUrl: 'https://my-rpc.com',
    });
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
