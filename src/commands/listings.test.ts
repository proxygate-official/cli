import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerListingsCommand } from './listings.js';

const mockListingsList = vi.fn();
const mockListingsUpdate = vi.fn();
const mockListingsPause = vi.fn();
const mockListingsUnpause = vi.fn();
const mockListingsDelete = vi.fn();
const mockListingsGet = vi.fn();
const mockDocs = vi.fn();

vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      listings: {
        list: (...args: unknown[]) => mockListingsList(...args),
        update: (...args: unknown[]) => mockListingsUpdate(...args),
        pause: (...args: unknown[]) => mockListingsPause(...args),
        unpause: (...args: unknown[]) => mockListingsUnpause(...args),
        delete: (...args: unknown[]) => mockListingsDelete(...args),
        get: (...args: unknown[]) => mockListingsGet(...args),
      },
      docs: (...args: unknown[]) => mockDocs(...args),
      apis: vi.fn().mockResolvedValue({ data: [], has_more: false, cursor: null }),
    }),
  },
  SHIELD_SURCHARGE_DISPLAY: '$0.005',
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

const LISTINGS_RESULT = {
  listings: [
    {
      id: 'abc12345-6789-0000-0000-000000000001',
      service_catalog: { name: 'OpenAI', slug: 'openai', base_url: 'https://api.openai.com' },
      is_active: true,
      total_rpm: 60,
      reserved_rpm: 10,
      price_per_request: 1000,
    },
  ],
};

describe('listings command', () => {
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
    registerListingsCommand(program);
    await program.parseAsync(['node', 'proxygate', 'listings', ...args]);
  };

  describe('list', () => {
    it('outputs JSON by default', async () => {
      mockListingsList.mockResolvedValue(LISTINGS_RESULT);
      await run('list');

      expect(logSpy).toHaveBeenCalledTimes(1);
      const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(parsed).toEqual(LISTINGS_RESULT);
    });

    it('outputs table with --table flag', async () => {
      mockListingsList.mockResolvedValue(LISTINGS_RESULT);
      await run('list', '--table');

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Seller Listings');
      expect(output).toContain('OpenAI');
      expect(output).toContain('active');
    });

    it('shows empty message with --table when no listings', async () => {
      mockListingsList.mockResolvedValue({ listings: [] });
      await run('list', '--table');

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('No listings found');
    });

    // -------------------------------------------------------------------------
    // Phase 51-09: slug-based identifier display
    // -------------------------------------------------------------------------

    it('shows slug column with --table when slug is present', async () => {
      mockListingsList.mockResolvedValue({
        listings: [
          {
            ...LISTINGS_RESULT.listings[0],
            slug: 'blockdb-api',
          },
        ],
      });
      await run('list', '--table');

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('blockdb-api');
    });

    it('falls back to truncated UUID with --table when slug is not yet set', async () => {
      mockListingsList.mockResolvedValue(LISTINGS_RESULT);
      await run('list', '--table');

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      // First 8 chars of UUID: abc12345-...
      expect(output).toContain('abc12345');
    });
  });

  describe('update', () => {
    it('passes update options to client', async () => {
      mockListingsUpdate.mockResolvedValue({ updated: true, id: 'abc' });
      await run('update', 'abc', '--total-rpm', '120', '--price', '2000');

      expect(mockListingsUpdate).toHaveBeenCalledWith('abc', expect.objectContaining({
        total_rpm: 120,
        price_per_request: 2000,
      }));
    });

    it('exits with error when no flags provided', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      await expect(run('update', 'abc')).rejects.toThrow('process.exit');
      mockExit.mockRestore();
    });
  });

  describe('pause', () => {
    it('pauses a listing', async () => {
      mockListingsPause.mockResolvedValue({ paused: true });
      await run('pause', 'abc');

      expect(mockListingsPause).toHaveBeenCalledWith('abc');
    });
  });

  describe('unpause', () => {
    it('unpauses a listing', async () => {
      mockListingsUnpause.mockResolvedValue({ unpaused: true });
      await run('unpause', 'abc');

      expect(mockListingsUnpause).toHaveBeenCalledWith('abc');
    });
  });

  describe('delete', () => {
    it('deletes a listing with --yes flag', async () => {
      mockListingsDelete.mockResolvedValue({ deleted: true });
      await run('delete', 'abc', '--yes');

      expect(mockListingsDelete).toHaveBeenCalledWith('abc');
    });
  });

  describe('docs', () => {
    it('shows documentation for a listing', async () => {
      mockDocs.mockResolvedValue({
        listing_id: 'abc',
        doc_type: 'openapi',
        content: '{"openapi":"3.0.0"}',
        parsed_endpoints: [{ method: 'POST', path: '/v1/chat', summary: 'Chat completion' }],
        updated_at: '2026-03-01',
      });
      await run('docs', 'abc');

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Documentation');
      expect(output).toContain('/v1/chat');
      expect(output).toContain('Chat completion');
    });

    it('renders a compact GraphQL operations index by default', async () => {
      mockDocs.mockResolvedValue({
        listing_id: 'abc', doc_type: 'graphql', updated_at: '2026-03-01',
        content: 'type Continent { code: ID! } type Query { continents(first: Int): [Continent!]! }',
        parsed_endpoints: null,
      });
      await run('docs', 'abc');
      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('continents');
      expect(output).toContain('[Continent!]!');
      expect(output).toContain('--operation'); // drill-in hint
    });

    it('drills into one GraphQL operation with --operation (return type fields resolved)', async () => {
      mockDocs.mockResolvedValue({
        listing_id: 'abc', doc_type: 'graphql', updated_at: '2026-03-01',
        content: 'type Continent { code: ID! name: String! } type Query { continents: [Continent!]! }',
        parsed_endpoints: null,
      });
      await run('docs', 'abc', '--operation', 'continents');
      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('Returns');
      expect(output).toContain('code'); // a field of the resolved return type
      expect(output).toContain('name');
    });

    it('--raw converts GraphQL introspection JSON to compact SDL', async () => {
      mockDocs.mockResolvedValue({
        listing_id: 'abc', doc_type: 'graphql', updated_at: '2026-03-01',
        content: 'type Query { ping: String }',
        parsed_endpoints: null,
      });
      await run('docs', 'abc', '--raw');
      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('type Query');
    });

    it('shows message when no docs', async () => {
      mockDocs.mockResolvedValue(null);
      await run('docs', 'abc');

      const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(output).toContain('No documentation found');
    });

    it('outputs raw content with --raw', async () => {
      mockDocs.mockResolvedValue({
        listing_id: 'abc',
        doc_type: 'openapi',
        content: '{"openapi":"3.0.0"}',
        parsed_endpoints: null,
        updated_at: '2026-03-01',
      });
      await run('docs', 'abc', '--raw');

      expect(logSpy).toHaveBeenCalledWith('{"openapi":"3.0.0"}');
    });
  });
});
