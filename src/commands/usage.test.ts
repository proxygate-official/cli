import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerUsageCommand } from './usage.js';

const mockUsage = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      usage: (...args: unknown[]) => mockUsage(...args),
    }),
  },
  ProxygateError: class extends Error {
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

const USAGE_RESULT = {
  usage: [
    {
      id: 'req-1',
      timestamp: '2026-02-26T12:00:00Z',
      service: 'openai',
      model: 'gpt-4',
      status_code: 200,
      latency_ms: 150,
      tokens_used: 500,
      cost_micro_cents: 3000,
      seller_id: 'seller-abc',
    },
  ],
  summary: [
    {
      service: 'openai',
      total_requests: 10,
      total_cost: 30000,
      avg_latency: 145,
    },
  ],
  limit: 20,
  offset: 0,
};

describe('usage command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runUsage = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>')
      .option('--keypair <path>')
      .option('--json', 'Output raw JSON');
    registerUsageCommand(program);
    await program.parseAsync(['node', 'proxygate', 'usage', ...args]);
  };

  it('outputs formatted summary and table by default', async () => {
    mockUsage.mockResolvedValue(USAGE_RESULT);
    await runUsage();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Usage Summary');
    expect(output).toContain('Recent Requests');
    expect(output).toContain('openai');
    expect(output).toContain('200');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockUsage.mockResolvedValue(USAGE_RESULT);
    await runUsage('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(USAGE_RESULT);
  });

  it('passes filter options to client', async () => {
    mockUsage.mockResolvedValue({ ...USAGE_RESULT, usage: [], summary: [] });
    await runUsage('--service', 'anthropic', '--from', '2026-01-01', '--limit', '5');

    expect(mockUsage).toHaveBeenCalledWith({
      service: 'anthropic',
      from: '2026-01-01',
      to: undefined,
      limit: 5,
    });
  });

  it('shows empty state when no usage entries', async () => {
    mockUsage.mockResolvedValue({ usage: [], summary: [], limit: 20, offset: 0 });
    await runUsage();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No usage entries found');
  });
});
