import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerHeadersSubcommand } from './headers.js';

const mockListingsGet = vi.fn();
const mockListingsUpdate = vi.fn();

vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      listings: {
        get: (...args: unknown[]) => mockListingsGet(...args),
        update: (...args: unknown[]) => mockListingsUpdate(...args),
      },
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

vi.mock('../../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

const LISTING_ID = '00000000-0000-0000-0000-000000000001';

describe('listings headers', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Force process.exit to throw so it can't kill the runner.
    // Not asserted → not bound to a var.
    vi.spyOn(process, 'exit').mockImplementation(() => {
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
    registerHeadersSubcommand(listings, program);
    await program.parseAsync(['node', 'proxygate', 'listings', 'headers', ...args]);
  };

  // ------------------------------------------------------------------
  // list
  // ------------------------------------------------------------------
  describe('list', () => {
    it('prints each header when the listing has upstream_headers', async () => {
      mockListingsGet.mockResolvedValue({
        id: LISTING_ID,
        upstream_headers: { 'X-Foo': 'bar', 'X-Trace-Id': '{{request_id}}' },
      });

      await run('list', LISTING_ID);

      expect(mockListingsGet).toHaveBeenCalledWith(LISTING_ID);
      const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(output).toContain('Upstream Headers');
      expect(output).toContain('X-Foo');
      expect(output).toContain('bar');
      expect(output).toContain('X-Trace-Id');
      expect(output).toContain('{{request_id}}');
    });

    it('prints "No upstream headers" when the listing has none', async () => {
      mockListingsGet.mockResolvedValue({ id: LISTING_ID, upstream_headers: {} });

      await run('list', LISTING_ID);

      const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(output).toContain('No upstream headers configured');
    });

    it('handles undefined upstream_headers without crashing', async () => {
      // Regression guard: if the gateway response omits upstream_headers
      // (e.g. the owner-scoped whitelist drops them) the command must
      // treat that as an empty map, not crash.
      mockListingsGet.mockResolvedValue({ id: LISTING_ID });

      await run('list', LISTING_ID);

      const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(output).toContain('No upstream headers configured');
    });
  });

  // ------------------------------------------------------------------
  // set
  // ------------------------------------------------------------------
  describe('set', () => {
    it('merges a new header into existing upstream_headers', async () => {
      mockListingsGet.mockResolvedValue({
        id: LISTING_ID,
        upstream_headers: { 'X-Existing': 'keep' },
      });
      mockListingsUpdate.mockResolvedValue({ ok: true });

      await run('set', LISTING_ID, 'X-New', 'v1');

      expect(mockListingsUpdate).toHaveBeenCalledWith(LISTING_ID, {
        upstream_headers: { 'X-Existing': 'keep', 'X-New': 'v1' },
      });
    });

    it('overwrites an existing header with the same name', async () => {
      mockListingsGet.mockResolvedValue({
        id: LISTING_ID,
        upstream_headers: { 'X-Foo': 'old' },
      });
      mockListingsUpdate.mockResolvedValue({ ok: true });

      await run('set', LISTING_ID, 'X-Foo', 'new');

      expect(mockListingsUpdate).toHaveBeenCalledWith(LISTING_ID, {
        upstream_headers: { 'X-Foo': 'new' },
      });
    });

    it('REGRESSION: does not silently wipe existing headers when gateway omits upstream_headers', async () => {
      // Scenario: gateway response does NOT include upstream_headers
      // (e.g. the seller-scoped endpoint stripped them). If the CLI falls
      // back to an empty object and the user calls `set`, the update call
      // would overwrite the real server-side headers with just the new one,
      // silently wiping every other header.
      //
      // The current implementation has this bug. This test encodes the
      // desired behaviour: when upstream_headers is missing from the read
      // response, `set` must refuse to proceed rather than issue a
      // destructive update.
      mockListingsGet.mockResolvedValue({ id: LISTING_ID });
      mockListingsUpdate.mockResolvedValue({ ok: true });

      await expect(run('set', LISTING_ID, 'X-New', 'v1')).rejects.toThrow();

      expect(mockListingsUpdate).not.toHaveBeenCalled();
      const errOutput = errorSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
      expect(errOutput.toLowerCase()).toContain('upstream_headers');
    });
  });

  // ------------------------------------------------------------------
  // unset
  // ------------------------------------------------------------------
  describe('unset', () => {
    it('removes a header while preserving the others', async () => {
      mockListingsGet.mockResolvedValue({
        id: LISTING_ID,
        upstream_headers: { 'X-Foo': 'bar', 'X-Keep': 'yes' },
      });
      mockListingsUpdate.mockResolvedValue({ ok: true });

      await run('unset', LISTING_ID, 'X-Foo');

      expect(mockListingsUpdate).toHaveBeenCalledWith(LISTING_ID, {
        upstream_headers: { 'X-Keep': 'yes' },
      });
    });

    it('errors when the header does not exist', async () => {
      mockListingsGet.mockResolvedValue({
        id: LISTING_ID,
        upstream_headers: { 'X-Other': 'bar' },
      });

      await expect(run('unset', LISTING_ID, 'X-Missing')).rejects.toThrow();
      expect(mockListingsUpdate).not.toHaveBeenCalled();
    });

    it('REGRESSION: refuses to unset when gateway omits upstream_headers', async () => {
      // Same reasoning as the set regression guard: if the CLI cannot read
      // the current set of headers, it cannot safely compute the new set
      // and must fail closed rather than wipe the server-side state.
      mockListingsGet.mockResolvedValue({ id: LISTING_ID });

      await expect(run('unset', LISTING_ID, 'X-Foo')).rejects.toThrow();
      expect(mockListingsUpdate).not.toHaveBeenCalled();
    });
  });
});
