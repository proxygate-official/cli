import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCategoriesCommand } from './categories.js';

const mockCategories = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      categories: (...args: unknown[]) => mockCategories(...args),
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

const CATEGORIES_RESULT = {
  categories: [
    {
      slug: 'llm',
      name: 'Language Models',
      icon: '🤖',
      listing_count: 12,
      subcategories: [
        { slug: 'chat', name: 'Chat', icon: '💬', listing_count: 8 },
        { slug: 'completion', name: 'Completion', icon: '📝', listing_count: 4 },
      ],
    },
  ],
  has_more: false,
  cursor: null,
};

describe('categories command', () => {
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
    registerCategoriesCommand(program);
    await program.parseAsync(['node', 'proxygate', 'categories', ...args]);
  };

  it('outputs formatted table by default', async () => {
    mockCategories.mockResolvedValue(CATEGORIES_RESULT);
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Categories');
    expect(output).toContain('Language Models');
    expect(output).toContain('12');
    expect(output).toContain('Chat');
    expect(output).toContain('Completion');
  });

  it('outputs raw JSON with --json flag', async () => {
    mockCategories.mockResolvedValue(CATEGORIES_RESULT);
    await run('--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(CATEGORIES_RESULT);
  });

  it('shows empty message when no categories', async () => {
    mockCategories.mockResolvedValue({ categories: [], has_more: false, cursor: null });
    await run();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('No categories available');
  });
});
