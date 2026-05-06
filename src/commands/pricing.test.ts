import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerPricingCommand } from './pricing.js';

const mockPricing = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      pricing: (...args: unknown[]) => mockPricing(...args),
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

const PRICING_RESULT = {
  services: [
    {
      service: 'openai',
      name: 'OpenAI',
      pricing_unit: 'per_request',
      price_per_request_micro_cents: 2000,
      price_per_request_usdc: 0.00002,
      price_per_input_token_micro_cents: null,
      price_per_output_token_micro_cents: null,
      price_per_input_token_usdc: null,
      price_per_output_token_usdc: null,
      available_rpm: 120,
      sellers: 3,
    },
  ],
  has_more: false,
  cursor: null,
  currency: 'micro_cents',
  deposit_endpoint: '/v1/deposit',
  last_updated: '2026-02-26T00:00:00Z',
};

describe('pricing command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runPricing = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>')
      .option('--keypair <path>')
      .option('--json', 'Output raw JSON');
    registerPricingCommand(program);
    await program.parseAsync(['node', 'proxygate', 'pricing', ...args]);
  };

  it('outputs formatted table by default', async () => {
    mockPricing.mockResolvedValue(PRICING_RESULT);
    await runPricing();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('openai');
    expect(output).toContain('Sellers');
    expect(output).toContain('120');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockPricing.mockResolvedValue(PRICING_RESULT);
    await runPricing('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(PRICING_RESULT);
  });

  it('passes --service filter to client', async () => {
    mockPricing.mockResolvedValue({ ...PRICING_RESULT, services: [] });
    await runPricing('--service', 'anthropic');

    expect(mockPricing).toHaveBeenCalledWith({ service: 'anthropic' });
  });
});
