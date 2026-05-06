import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerGettingStartedCommand } from './getting-started.js';

vi.mock('@proxygate/sdk', () => ({
  ProxygateClient: {
    create: vi.fn().mockResolvedValue({
      walletAddress: '3uQP6CDmzC274Q3V5ZZDWfqTXRJuV6Kx6C6TgNKUSJF3',
      vault: {
        balance: vi.fn().mockResolvedValue({
          balance: 5_000_000,
          pending_settlement: 0,
          available: 5_000_000,
          in_cooldown: false,
        }),
      },
      pricing: vi.fn().mockResolvedValue({
        services: [
          {
            service: 'weather-api',
            name: 'Weather API',
            pricing_unit: 'per_request',
            price_per_request_usdc: 0.01,
            sellers: 2,
            available_rpm: 60,
          },
        ],
      }),
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
  saveConfig: vi.fn(),
  CONFIG_PATH: '~/.proxygate/config.json',
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
}));

describe('getting-started command', () => {
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
    program.option('--gateway <url>').option('--keypair <path>');
    registerGettingStartedCommand(program);
    await program.parseAsync(['node', 'proxygate', 'getting-started', ...args]);
  };

  it('prints welcome message', async () => {
    await run('--keypair', '/tmp/key.json');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Welcome to Proxygate');
  });

  it('runs through all steps with valid keypair', async () => {
    await run('--keypair', '/tmp/key.json');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Step 1');
    expect(output).toContain('Step 2');
    expect(output).toContain('Step 3');
    expect(output).toContain('Step 4');
    expect(output).toContain('Step 5');
  });

  it('shows next steps section', async () => {
    await run('--keypair', '/tmp/key.json');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Next steps');
  });
});
