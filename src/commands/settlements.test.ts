import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerSettlementsCommand } from './settlements.js';

const mockSettlements = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      settlements: (...args: unknown[]) => mockSettlements(...args),
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

const BUYER_RESULT = {
  role: 'buyer' as const,
  date_range: { from: '2026-03-01', to: '2026-03-05' },
  daily: [
    { date: '2026-03-01', service: 'openai', request_count: 50, total_cost_usdc: 0.5, total_fees_usdc: 0.025, net_spend_usdc: 0.525 },
  ],
  cursor: null,
  has_more: false,
  summary: { total_requests: 50, total_cost_usdc: 0.5, total_fees_usdc: 0.025 },
};

const SELLER_RESULT = {
  role: 'seller' as const,
  date_range: { from: '2026-03-01', to: '2026-03-05' },
  daily: [
    { date: '2026-03-01', service: 'openai', request_count: 50, total_earnings_usdc: 0.475, total_fees_usdc: 0.025, net_payout_usdc: 0.45 },
  ],
  cursor: null,
  has_more: false,
  summary: { total_requests: 50, total_earnings_usdc: 0.475, total_fees_usdc: 0.025 },
};

describe('settlements command', () => {
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
    registerSettlementsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'settlements', ...args]);
  };

  it('outputs formatted buyer settlement', async () => {
    mockSettlements.mockResolvedValue(BUYER_RESULT);
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Settlement History (buyer)');
    expect(output).toContain('50');
    expect(output).toContain('openai');
  });

  it('outputs formatted seller settlement', async () => {
    mockSettlements.mockResolvedValue(SELLER_RESULT);
    await run('--role', 'seller');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Settlement History (seller)');
    expect(output).toContain('Earnings');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockSettlements.mockResolvedValue(BUYER_RESULT);
    await run('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(BUYER_RESULT);
  });

  it('passes filter options to client', async () => {
    mockSettlements.mockResolvedValue({ ...BUYER_RESULT, daily: [] });
    await run('--role', 'seller', '--service', 'openai', '--from', '2026-03-01');

    expect(mockSettlements).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'seller', service: 'openai', from: '2026-03-01' }),
    );
  });

  it('shows empty message when no data', async () => {
    mockSettlements.mockResolvedValue({ ...BUYER_RESULT, daily: [] });
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No settlement data found');
  });
});
