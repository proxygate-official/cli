import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCreateSubcommand } from './create.js';

const mockListingsCreate = vi.fn();

vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      listings: {
        create: (...args: unknown[]) => mockListingsCreate(...args),
      },
    }),
  },
  SHIELD_SURCHARGE_DISPLAY: '$0.005',
  ProxygateError: class extends Error {
    code: string;
    constructor(msg: string, code: string) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock('../../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

function makeTestResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    status: 200,
    status_text: 'OK',
    latency_ms: 123,
    endpoint: { method: 'GET', path: '/v1/models' },
    validation_type: 'full',
    ...overrides,
  };
}

describe('listings create', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
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
    const listings = program.command('listings').description('Listings');
    registerCreateSubcommand(listings, program);
    await program.parseAsync(['node', 'proxygate', 'listings', 'create', ...args]);
  };

  it('displays per-endpoint test results when response includes test_results', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id',
      service: 'my-api',
      is_active: true,
      key_masked: 'sk-...abc',
      sync_status: 'synced',
      test_results: [
        makeTestResult({ success: true, status: 200, endpoint: { method: 'GET', path: '/v1/models' }, validation_type: 'full' }),
        makeTestResult({ success: true, status: 400, endpoint: { method: 'POST', path: '/v1/chat' }, validation_type: 'auth_only' }),
      ],
      test_passed: true,
    });
    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Endpoint Tests');
    expect(output).toContain('GET');
    expect(output).toContain('/v1/models');
  });

  it('shows activation hint when test_passed is false', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id',
      service: 'my-api',
      is_active: false,
      key_masked: 'sk-...abc',
      sync_status: 'pending',
      test_results: [
        makeTestResult({ success: false, status: 401, endpoint: { method: 'GET', path: '/v1/models' }, validation_type: 'full' }),
      ],
      test_passed: false,
    });

    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('inactive');
    expect(output).toContain('upload-docs');
  });

  it('--skip-test passes skip_test=true to SDK and does not display test results', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id',
      service: 'my-api',
      is_active: true,
      key_masked: 'sk-...abc',
      sync_status: 'synced',
    });
    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai', '--skip-test');

    expect(mockListingsCreate).toHaveBeenCalledWith(expect.objectContaining({ skip_test: true }));
    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).not.toContain('Endpoint Tests');
  });

  it('formats GET success as green OK with status', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id', service: 'my-api', is_active: true, key_masked: 'sk-...abc', sync_status: 'synced',
      test_results: [makeTestResult({ success: true, status: 200, endpoint: { method: 'GET', path: '/v1/models' }, validation_type: 'full' })],
      test_passed: true,
    });
    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('OK');
    expect(output).toContain('200');
    expect(output).not.toContain('AUTH OK');
  });

  it('formats non-GET success as green AUTH OK with status', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id', service: 'my-api', is_active: true, key_masked: 'sk-...abc', sync_status: 'synced',
      test_results: [makeTestResult({ success: true, status: 400, endpoint: { method: 'POST', path: '/v1/chat' }, validation_type: 'auth_only' })],
      test_passed: true,
    });
    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('AUTH OK');
    expect(output).toContain('400');
  });

  it('formats failed endpoints with red FAIL and status', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id', service: 'my-api', is_active: false, key_masked: 'sk-...abc', sync_status: 'pending',
      test_results: [makeTestResult({ success: false, status: 401, endpoint: { method: 'GET', path: '/v1/models' }, validation_type: 'full' })],
      test_passed: false,
    });

    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('FAIL');
    expect(output).toContain('401');
  });

  it('shows WAF/CDN hint for 403 failures', async () => {
    mockListingsCreate.mockResolvedValue({
      id: 'test-id', service: 'my-api', is_active: false, key_masked: 'sk-...abc', sync_status: 'pending',
      test_results: [makeTestResult({ success: false, status: 403, endpoint: { method: 'GET', path: '/v1/models' }, validation_type: 'full', hint: 'Access denied — key may lack permissions, or a WAF/CDN is blocking non-browser requests.' })],
      test_passed: false,
    });

    await run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('WAF');
  });

  // ---------------------------------------------------------------------------
  // Phase 51.6: --free / matrix rows
  // Covers the four SPEC matrix rows from the CLI side, plus the new flag.
  // ---------------------------------------------------------------------------
  describe('Phase 51.6: --free / matrix rows', () => {
    function setSuccess(): void {
      mockListingsCreate.mockResolvedValue({
        id: 'new-id',
        service: 'svc',
        is_active: false,
        key_masked: 'none',
        sync_status: 'pending',
      });
    }

    it('--free maps to price=0 (matrix row 1)', async () => {
      setSuccess();
      await run(
        '--non-interactive',
        '--service-name', 'Open-Meteo',
        '--base-url', 'https://api.open-meteo.com',
        '--auth-pattern', 'none',
        '--categories', 'weather',
        '--free',
      );

      expect(mockListingsCreate).toHaveBeenCalledTimes(1);
      expect(mockListingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ price_per_request: 0 }),
      );
      const sent = mockListingsCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(sent.endpoint_prices).toBeUndefined();
    });

    it('--price 1000 (matrix row 2: paid, no overrides)', async () => {
      setSuccess();
      await run(
        '--non-interactive',
        '--service-name', 'Paid API',
        '--base-url', 'https://api.paid.com',
        '--auth-pattern', 'bearer',
        '--credential', 'sk-test',
        '--categories', 'ai',
        '--price', '1000',
      );

      expect(mockListingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ price_per_request: 1000 }),
      );
      const sent = mockListingsCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(sent.endpoint_prices).toBeUndefined();
    });

    it('--price 1000 + --free-endpoint /a (matrix row 3: paid + free endpoints)', async () => {
      setSuccess();
      await run(
        '--non-interactive',
        '--service-name', 'Mixed API',
        '--base-url', 'https://api.mixed.com',
        '--auth-pattern', 'bearer',
        '--credential', 'sk-test',
        '--categories', 'ai',
        '--price', '1000',
        '--free-endpoint', '/v1/sample',
        '--free-endpoint', '/v1/ping:50',
      );

      const sent = mockListingsCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(sent.price_per_request).toBe(1000);
      const overrides = sent.endpoint_prices as Array<Record<string, unknown>>;
      expect(overrides).toHaveLength(2);
      expect(overrides[0]).toMatchObject({ path: '/v1/sample', price_per_request: 0 });
      expect(overrides[1]).toMatchObject({ path: '/v1/ping', price_per_request: 0, daily_cap_per_wallet: 50 });
    });

    it('--free + --endpoint-price /a=5000 (matrix row 4: free + paid endpoints)', async () => {
      setSuccess();
      await run(
        '--non-interactive',
        '--service-name', 'Free Default API',
        '--base-url', 'https://api.free.com',
        '--auth-pattern', 'none',
        '--categories', 'weather',
        '--free',
        '--endpoint-price', '/v1/premium=5000',
        '--endpoint-price', '/v1/bulk=10000',
      );

      const sent = mockListingsCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(sent.price_per_request).toBe(0);
      const overrides = sent.endpoint_prices as Array<Record<string, unknown>>;
      expect(overrides).toHaveLength(2);
      expect(overrides[0]).toMatchObject({ path: '/v1/premium', price_per_request: 5000 });
      expect(overrides[1]).toMatchObject({ path: '/v1/bulk', price_per_request: 10000 });
    });

    it('--free overrides --price with warning when --price is non-default', async () => {
      setSuccess();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await run(
        '--non-interactive',
        '--service-name', 'Test',
        '--base-url', 'https://api.test.com',
        '--auth-pattern', 'none',
        '--categories', 'ai',
        '--free',
        '--price', '5000',
      );

      expect(mockListingsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ price_per_request: 0 }),
      );
      const warned = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(warned).toContain('--free overrides --price');
      warnSpy.mockRestore();
    });
  });
});
