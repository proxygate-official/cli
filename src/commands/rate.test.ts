import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerRateCommand } from './rate.js';

const mockRate = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      rate: (...args: unknown[]) => mockRate(...args),
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

describe('rate command', () => {
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
    registerRateCommand(program);
    await program.parseAsync(['node', 'proxygate', 'rate', ...args]);
  };

  it('submits a positive rating with --up', async () => {
    mockRate.mockResolvedValue({ success: true, is_update: false });
    await run('--request-id', 'req-abc-123', '--up');

    expect(mockRate).toHaveBeenCalledWith({ request_id: 'req-abc-123', is_positive: true });

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('submitted');
    expect(output).toContain('positive');
  });

  it('submits a negative rating with --down', async () => {
    mockRate.mockResolvedValue({ success: true, is_update: false });
    await run('--request-id', 'req-abc-123', '--down');

    expect(mockRate).toHaveBeenCalledWith({ request_id: 'req-abc-123', is_positive: false });
  });

  it('exits with error when neither --up nor --down provided', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(run('--request-id', 'req-abc-123')).rejects.toThrow('process.exit');
    mockExit.mockRestore();
  });

  it('outputs raw JSON with --json flag', async () => {
    const result = { status: 'ok', message: 'Rating submitted' };
    mockRate.mockResolvedValue(result);
    await run('--request-id', 'req-abc-123', '--up', '--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });
});
