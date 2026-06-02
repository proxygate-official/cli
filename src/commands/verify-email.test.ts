import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { ProxygateError } from '@proxygate/sdk';
import { registerVerifyEmailCommand } from './verify-email.js';

const mockVerify = vi.fn();

vi.mock('@proxygate/sdk', () => {
  // Defined inside the factory (vi.mock is hoisted above module top-level).
  class MockProxygateError extends Error {
    code: string;
    action?: string;
    docs?: string;
    statusCode: number;
    constructor(
      gatewayError: { error: string; message: string; action?: string; docs?: string },
      statusCode: number,
    ) {
      super(gatewayError.message);
      this.code = gatewayError.error;
      this.action = gatewayError.action;
      this.docs = gatewayError.docs;
      this.statusCode = statusCode;
    }
  }
  return {
    ProxygateClient: {
      create: vi.fn().mockResolvedValue({
        verifyContactEmail: (...args: unknown[]) => mockVerify(...args),
      }),
    },
    ProxygateError: MockProxygateError,
  };
});

// Bound to the mocked class above (the import is rewritten by vi.mock).
const MockProxygateError = ProxygateError as unknown as new (
  gatewayError: { error: string; message: string; action?: string; docs?: string },
  statusCode: number,
) => Error;

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/key.json',
  }),
}));

vi.mock('../lib/auth-check.js', () => ({
  checkDelegationExpiry: vi.fn(),
}));

describe('verify-email command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
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
    registerVerifyEmailCommand(program);
    await program.parseAsync(['node', 'proxygate', 'verify-email', ...args]);
  };

  it('verifies with --token and prints status', async () => {
    mockVerify.mockResolvedValue({ verified: true, status: 'verified' });
    await run('--token', 'tok-123');

    expect(mockVerify).toHaveBeenCalledWith({ token: 'tok-123' });
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('verified');
  });

  it('outputs raw JSON with --json flag', async () => {
    const result = { verified: true, status: 'verified' };
    mockVerify.mockResolvedValue(result);
    await run('--token', 'tok-123', '--json');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed: unknown = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(parsed).toEqual(result);
  });

  it('exits non-zero on an unverified (expired) status', async () => {
    mockVerify.mockResolvedValue({ verified: false, status: 'expired' });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(run('--token', 'old-tok')).rejects.toThrow('process.exit');
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('not verified');
    mockExit.mockRestore();
  });

  it('surfaces the web-claim pointer on a collision error (does not crash)', async () => {
    mockVerify.mockRejectedValue(
      new MockProxygateError(
        {
          error: 'verification_required',
          message: 'This email is already linked to another account.',
          action: 'Sign in with the original method, then link this wallet in Settings.',
          docs: 'https://docs.proxygate.ai/email-conflict',
        },
        409,
      ),
    );
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    // handleError prints + exits(1); the thrown sentinel just lets us assert it ran.
    await expect(run('--token', 'tok-dup')).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(errOutput).toContain('verification_required');
    expect(errOutput).toContain('link this wallet in Settings');
    expect(errOutput).toContain('docs.proxygate.ai/email-conflict');
    mockExit.mockRestore();
  });
});
