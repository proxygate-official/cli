import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCreateSubcommand } from './create.js';

const mockListingsCreate = vi.fn();

vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      listings: {
        create: (...args: unknown[]) => mockListingsCreate(...args),
      },
    }),
  },
  SHIELD_SURCHARGE_DISPLAY: '$0.005',
  ProxyGateError: class extends Error {
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

  it('exits non-zero when test_passed is false', async () => {
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

    await expect(
      run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai'),
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
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

    await expect(
      run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai'),
    ).rejects.toThrow('process.exit');

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

    await expect(
      run('--non-interactive', '--service-name', 'Test', '--base-url', 'https://api.test.com', '--auth-pattern', 'bearer', '--credential', 'sk-test', '--categories', 'ai'),
    ).rejects.toThrow('process.exit');

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('WAF');
    expect(output).toContain('retry');
  });
});
