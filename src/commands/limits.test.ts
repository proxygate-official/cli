import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerLimitsCommand, parseUsdcToMicro } from './limits.js';

const mockGet = vi.fn();
const mockSet = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      getSpendLimits: (...args: unknown[]) => mockGet(...args),
      setSpendLimits: (...args: unknown[]) => mockSet(...args),
    }),
  },
  ProxygateError: class ProxygateError extends Error {
    code: string;
    action?: string;
    constructor(gatewayError: { error: string; message: string; action?: string }, _statusCode?: number) {
      super(gatewayError.message);
      this.code = gatewayError.error;
      this.action = gatewayError.action;
    }
  },
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/test-key.json',
  }),
}));

describe('parseUsdcToMicro', () => {
  it('converts USDC to micro-USDC', () => {
    expect(parseUsdcToMicro('25')).toBe(25_000_000);
    expect(parseUsdcToMicro('1.5')).toBe(1_500_000);
    expect(parseUsdcToMicro('0')).toBe(0);
  });

  it('rounds to the nearest micro-USDC', () => {
    expect(parseUsdcToMicro('0.0000005')).toBe(1);
  });

  it('returns null for "none" (case-insensitive, trimmed)', () => {
    expect(parseUsdcToMicro('none')).toBeNull();
    expect(parseUsdcToMicro('  None ')).toBeNull();
  });

  it('throws on a negative or non-numeric amount', () => {
    expect(() => parseUsdcToMicro('-1')).toThrow();
    expect(() => parseUsdcToMicro('abc')).toThrow();
  });
});

describe('limits command', () => {
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

  const run = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>', 'Override gateway URL')
      .option('--keypair <path>', 'Override keypair path')
      .option('--json', 'Output raw JSON');
    registerLimitsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'limits', ...args]);
  };

  it('get prints the current daily and per-transaction limits in USDC', async () => {
    mockGet.mockResolvedValue({ daily_limit_micro_usdc: 25_000_000, per_tx_limit_micro_usdc: 1_000_000 });

    await run('get');

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Daily');
    expect(out).toContain('25.000000 USDC');
    expect(out).toContain('Per-transaction');
    expect(out).toContain('1.000000 USDC');
  });

  it('get shows "not set" for null limits', async () => {
    mockGet.mockResolvedValue({ daily_limit_micro_usdc: null, per_tx_limit_micro_usdc: null });

    await run('get');

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('not set');
  });

  it('get --json prints the raw limits', async () => {
    mockGet.mockResolvedValue({ daily_limit_micro_usdc: 25_000_000, per_tx_limit_micro_usdc: null });

    await run('get', '--json');

    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(JSON.parse(out)).toEqual({ daily_limit_micro_usdc: 25_000_000, per_tx_limit_micro_usdc: null });
  });

  it('set converts USDC to micro-USDC and sends only the touched limit', async () => {
    mockGet.mockResolvedValue({ daily_limit_micro_usdc: 10_000_000, per_tx_limit_micro_usdc: 2_000_000 });
    mockSet.mockResolvedValue({ daily_limit_micro_usdc: 25_000_000, per_tx_limit_micro_usdc: 2_000_000 });

    await run('set', '--daily', '25');

    // Unspecified --per-tx keeps the current value.
    expect(mockSet).toHaveBeenCalledWith({ daily_limit_micro_usdc: 25_000_000, per_tx_limit_micro_usdc: 2_000_000 });
    const out = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(out).toContain('Spend limits updated');
  });

  it('set --daily none clears the daily limit', async () => {
    mockGet.mockResolvedValue({ daily_limit_micro_usdc: 10_000_000, per_tx_limit_micro_usdc: 2_000_000 });
    mockSet.mockResolvedValue({ daily_limit_micro_usdc: null, per_tx_limit_micro_usdc: 2_000_000 });

    await run('set', '--daily', 'none');

    expect(mockSet).toHaveBeenCalledWith({ daily_limit_micro_usdc: null, per_tx_limit_micro_usdc: 2_000_000 });
  });

  it('set with no flags exits with an error and does not call the API', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(run('set')).rejects.toThrow('process.exit');

    expect(mockSet).not.toHaveBeenCalled();
    const err = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(err).toContain('at least one of --daily or --per-tx');
    mockExit.mockRestore();
  });

  it('set with an invalid amount exits with a clear message, no API call', async () => {
    mockGet.mockResolvedValue({ daily_limit_micro_usdc: null, per_tx_limit_micro_usdc: null });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(run('set', '--daily', 'lots')).rejects.toThrow('process.exit');

    expect(mockSet).not.toHaveBeenCalled();
    const err = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(err).toContain('Invalid amount');
    mockExit.mockRestore();
  });

  it('renders a clear message (no stack trace) when the key lacks the wallet:limits scope', async () => {
    const { ProxygateError } = await import('@proxygate/sdk');
    mockGet.mockRejectedValue(
      new ProxygateError(
        {
          error: 'scope_required',
          message: 'This API key is missing the `wallet:limits` scope required to read or change spend limits.',
          action: 'Grant the `wallet:limits` scope to this key in the Proxygate web app, or create a new key with it.',
        },
        403,
      ),
    );
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(run('get')).rejects.toThrow('process.exit');

    const err = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(err).toContain('scope_required');
    expect(err).toContain('wallet:limits');
    expect(err).not.toContain('at limits.ts');
    mockExit.mockRestore();
  });
});
