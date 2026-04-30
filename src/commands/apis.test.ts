import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerApisCommand } from './apis.js';

const mockApis = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      apis: (...args: unknown[]) => mockApis(...args),
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

const APIS_RESULT = {
  data: [
    {
      listing_id: 'abc12345-6789-0000-0000-000000000001',
      seller_wallet: '8Kag2c9vqVT7xLMpRa5JKrGeUVPxfYbcWEuvGLBAW123',
      service: 'openai',
      service_name: 'OpenAI',
      auth_pattern: 'bearer',
      pricing_unit: 'per_request',
      price_per_request_usdc: 0.00002,
      price_per_input_token_usdc: null,
      price_per_output_token_usdc: null,
      available_rpm: 120,
      uptime_percent: 99.5,
      avg_latency_ms: 250,
      trust_score: 0.95,
      badges: ['verified'],
      is_available: true,
      member_since: '2026-01-01',
      endpoints: [],
    },
  ],
  cursor: null,
  has_more: false,
};

describe('apis command', () => {
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
    registerApisCommand(program);
    await program.parseAsync(['node', 'proxygate', 'apis', ...args]);
  };

  it('outputs formatted table by default', async () => {
    mockApis.mockResolvedValue(APIS_RESULT);
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('API Listings');
    expect(output).toContain('OpenAI');
    expect(output).toContain('120');
    expect(output).toContain('99.5%');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockApis.mockResolvedValue(APIS_RESULT);
    await run('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(APIS_RESULT);
  });

  it('passes filter options to client', async () => {
    mockApis.mockResolvedValue({ ...APIS_RESULT, data: [] });
    await run('--service', 'openai', '--category', 'llm', '--sort', 'price_asc');

    expect(mockApis).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'openai', category: 'llm', sort: 'price_asc' }),
    );
  });

  it('shows empty message when no listings', async () => {
    mockApis.mockResolvedValue({ data: [], cursor: null, has_more: false });
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No listings found');
  });

  it('shows more results hint when has_more is true', async () => {
    mockApis.mockResolvedValue({ ...APIS_RESULT, has_more: true });
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('More available');
  });

  // ---------------------------------------------------------------------------
  // Phase 51-09: slug-based identifier display
  // ---------------------------------------------------------------------------

  describe('slug-based identifiers', () => {
    it('shows seller_slug/slug composite as Listing column when both are present', async () => {
      mockApis.mockResolvedValue({
        ...APIS_RESULT,
        data: [
          {
            ...APIS_RESULT.data[0],
            slug: 'blockdb-api',
            seller_slug: 'blockdb',
            organization: 'Blockchain Database LTD',
            seller_account_type: 'organization',
          },
        ],
      });
      await run();

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Listing');
      expect(output).toContain('blockdb/blockdb-api');
      // Seller column should display organization, not the truncated wallet
      expect(output).toContain('Blockchain Database LTD');
    });

    it('falls back to truncated UUID when slug is not yet set (legacy listing)', async () => {
      mockApis.mockResolvedValue({
        ...APIS_RESULT,
        data: [
          {
            ...APIS_RESULT.data[0],
            // No slug / seller_slug fields — pre-backfill listing
          },
        ],
      });
      await run();

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      // Truncated UUID = first 8 chars of listing_id
      expect(output).toContain('abc12345');
    });

    it('--json mode includes raw seller_slug + slug fields untouched', async () => {
      const enriched = {
        ...APIS_RESULT,
        data: [
          {
            ...APIS_RESULT.data[0],
            slug: 'blockdb-api',
            seller_slug: 'blockdb',
            seller_account_type: 'organization',
          },
        ],
      };
      mockApis.mockResolvedValue(enriched);
      await run('--json');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as typeof enriched;
      expect(parsed.data[0].slug).toBe('blockdb-api');
      expect(parsed.data[0].seller_slug).toBe('blockdb');
      expect(parsed.data[0].seller_account_type).toBe('organization');
    });
  });
});
