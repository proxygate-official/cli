import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerServicesCommand } from './services.js';

const mockServices = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      services: (...args: unknown[]) => mockServices(...args),
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

const SERVICES_RESULT = {
  services: [
    {
      service: 'openai',
      service_name: 'OpenAI',
      cheapest_price_usdc: 0.00002,
      avg_latency_ms: 250,
      active_seller_count: 3,
      total_capacity_rpm: 360,
      avg_uptime_percent: 99.2,
      avg_rating: 4.8,
      best_rated_seller_wallet: '8Kag2c9vqVT7xLMpRa5JKrGeUVPxfYbcWEuvGLBAW123',
      pricing_units: 'per_request' as const,
    },
  ],
  has_more: false,
  cursor: null,
  count: 1,
};

describe('services command', () => {
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
    registerServicesCommand(program);
    await program.parseAsync(['node', 'proxygate', 'services', ...args]);
  };

  it('outputs formatted table by default', async () => {
    mockServices.mockResolvedValue(SERVICES_RESULT);
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Services (1)');
    expect(output).toContain('OpenAI');
    expect(output).toContain('250ms');
    expect(output).toContain('360');
    expect(output).toContain('4.8');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockServices.mockResolvedValue(SERVICES_RESULT);
    await run('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(SERVICES_RESULT);
  });

  it('shows empty message when no services', async () => {
    mockServices.mockResolvedValue({ services: [], has_more: false, cursor: null, count: 0 });
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No services available');
  });
});
