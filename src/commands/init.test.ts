import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { ProxygateError } from '@proxygate/sdk';
import { registerInitCommand } from './init.js';

const mockBalance = vi.fn();
const mockCreate = vi.fn();
const mockSetEmail = vi.fn();

vi.mock('@proxygate/sdk', () => {
  // Defined inside the factory (vi.mock is hoisted above module top-level).
  class MockProxygateError extends Error {
    code: string;
    action?: string;
    docs?: string;
    constructor(gatewayError: { error: string; message: string; action?: string; docs?: string }) {
      super(gatewayError.message);
      this.code = gatewayError.error;
      this.action = gatewayError.action;
      this.docs = gatewayError.docs;
    }
  }
  return {
    ProxygateClient: {
      create: (...args: unknown[]) => mockCreate(...args),
    },
    ProxygateError: MockProxygateError,
  };
});

// Bound to the mocked class above (the import is rewritten by vi.mock).
const MockProxygateError = ProxygateError as unknown as new (
  gatewayError: { error: string; message: string; action?: string; docs?: string },
) => Error;

const mockSaveConfig = vi.fn();
vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue(null),
  saveConfig: (...args: unknown[]) => mockSaveConfig(...args),
  CONFIG_DIR: '/home/test/.proxygate',
  CONFIG_PATH: '/home/test/.proxygate/config.json',
}));

const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
vi.mock('node:fs/promises', () => ({
  access: (...args: unknown[]) => mockAccess(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

// Mock parseKeypair to avoid reading actual files
vi.mock('../keypair.js', () => ({
  parseKeypair: () => ({
    secretKey: Array.from({ length: 64 }, (_, i) => i),
    format: 'Solana CLI keypair (64-byte JSON array)',
  }),
}));

describe('init command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Default: file exists, client creation succeeds, balance succeeds
    mockAccess.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(JSON.stringify(Array.from({ length: 64 }, (_, i) => i)));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockBalance.mockResolvedValue({ balance: 5_000_000 });
    mockSetEmail.mockResolvedValue({ success: true });
    mockCreate.mockResolvedValue({
      walletAddress: 'TestWallet11111111111111111111111111111111111',
      balance: (...args: unknown[]) => mockBalance(...args),
      setContactEmail: (...args: unknown[]) => mockSetEmail(...args),
    });
    mockSaveConfig.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runInit = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    registerInitCommand(program);
    await program.parseAsync(['node', 'proxygate', 'init', ...args]);
  };

  it('happy path: keypair exists, gateway reachable, config saved', async () => {
    await runInit('--keypair', '/tmp/test-key.json', '--gateway', 'http://localhost:3001');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('TestWallet1111');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('exits with error when keypair file not found', async () => {
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      runInit('--keypair', '/nonexistent/key.json'),
    ).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('not found');
    expect(mockSaveConfig).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  it('saves config even when gateway is unreachable (non-fatal)', async () => {
    mockBalance.mockRejectedValue(new Error('ECONNREFUSED'));

    await runInit('--keypair', '/tmp/test-key.json', '--gateway', 'http://localhost:3001');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Could not connect to gateway');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('uses custom --gateway flag value', async () => {
    await runInit('--keypair', '/tmp/test-key.json', '--gateway', 'https://custom-gw.io');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('https://custom-gw.io');
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ gatewayUrl: 'https://custom-gw.io' }),
    );
  });

  it('exits when both --keypair and --generate provided', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      runInit('--keypair', '/tmp/key.json', '--generate'),
    ).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Cannot use both');
    mockExit.mockRestore();
  });

  it('exits with error when ProxygateClient.create fails', async () => {
    mockCreate.mockRejectedValue(new Error('Invalid keypair format'));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      runInit('--keypair', '/tmp/bad-key.json'),
    ).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Failed to load keypair');
    expect(mockSaveConfig).not.toHaveBeenCalled();
    mockExit.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Fase 1: contact-email capture
  // -------------------------------------------------------------------------

  it('--email submits the email and prints the verification notice', async () => {
    await runInit('--keypair', '/tmp/test-key.json', '--email', 'agent@example.com');

    expect(mockSetEmail).toHaveBeenCalledWith({ email: 'agent@example.com' });
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Verification email sent to');
    expect(output).toContain('agent@example.com');
    // Email capture is part of a successful init.
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('non-interactive (no TTY) with no --email skips email capture silently', async () => {
    // Vitest runs without a TTY, so process.stdin.isTTY is falsy here.
    await runInit('--keypair', '/tmp/test-key.json');

    expect(mockSetEmail).not.toHaveBeenCalled();
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('email submit failure does NOT abort init — config is still saved', async () => {
    mockSetEmail.mockRejectedValue(new Error('gateway 500'));

    await runInit('--keypair', '/tmp/test-key.json', '--email', 'agent@example.com');

    expect(mockSetEmail).toHaveBeenCalledOnce();
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('Could not save email');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });

  it('email collision surfaces the web-claim pointer without aborting init', async () => {
    mockSetEmail.mockRejectedValue(
      new MockProxygateError({
        error: 'verification_required',
        message: 'This email is already linked to another account.',
        action: 'Sign in with the original method, then link this wallet in Settings.',
        docs: 'https://docs.proxygate.ai/email-conflict',
      }),
    );

    await runInit('--keypair', '/tmp/test-key.json', '--email', 'taken@example.com');

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('verification_required');
    expect(output).toContain('link this wallet in Settings');
    expect(output).toContain('docs.proxygate.ai/email-conflict');
    expect(output).toContain('Config saved');
    expect(mockSaveConfig).toHaveBeenCalledOnce();
  });
});
