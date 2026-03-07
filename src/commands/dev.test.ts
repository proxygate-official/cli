import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerDevCommand } from './dev.js';

const mockReadFile = vi.fn();
const mockWatch = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));
vi.mock('node:fs', () => ({
  watch: (...args: unknown[]) => mockWatch(...args),
}));

const mockYamlLoad = vi.fn();
vi.mock('js-yaml', () => ({
  default: { load: (...args: unknown[]) => mockYamlLoad(...args) },
}));

const mockServe = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGate: {
    serve: (...args: unknown[]) => mockServe(...args),
  },
}));

const mockLoadConfig = vi.fn();
vi.mock('../config.js', () => ({
  loadConfig: () => mockLoadConfig(),
}));

// Mock fetch for health checks
const mockFetch = vi.fn();

describe('dev command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockRejectedValue(new Error('not running'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://localhost:3001',
      keypairPath: '/tmp/keypair.json',
    });

    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      services: [{ name: 'test-svc', port: 3000, price_per_request: 1000 }],
    });

    // Mock watcher that does nothing
    mockWatch.mockReturnValue({ close: vi.fn(), [Symbol.asyncIterator]: vi.fn() });

    mockServe.mockResolvedValue({
      disconnect: vi.fn(),
      isConnected: () => true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const runDev = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program.option('--gateway <url>');
    program.option('--keypair <path>');
    registerDevCommand(program);
    // Don't actually await forever — the command keeps the process alive
    // Just verify it calls ProxyGate.serve with the right args
    const promise = program.parseAsync(['node', 'proxygate', 'dev', ...args]);
    // Give it a tick to start
    await new Promise((r) => setTimeout(r, 50));
    // We can't cleanly resolve since it awaits forever, so we just check mocks
  };

  it('calls ProxyGate.serve with config from tunnel yaml', async () => {
    await runDev();

    expect(mockServe).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'http://localhost:3001',
        keypair: '/tmp/keypair.json',
        services: [{ name: 'test-svc', port: 3000, price_per_request: 1000 }],
      }),
    );
  });

  it('passes onConnected, onDisconnected, onError, onRequest callbacks', async () => {
    await runDev();

    const callArgs = mockServe.mock.calls[0]?.[0];
    expect(callArgs).toHaveProperty('onConnected');
    expect(callArgs).toHaveProperty('onDisconnected');
    expect(callArgs).toHaveProperty('onError');
    expect(callArgs).toHaveProperty('onRequest');
  });

  it('shows Dev Mode header in output', async () => {
    await runDev();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Dev Mode');
  });
});
