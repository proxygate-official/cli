import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub the SDK ProxygateError class so our test errors flow through handleError.
// Class is defined inside the vi.mock factory because vi.mock is hoisted to the
// top of the file before any other imports execute.
vi.mock('@proxygate/sdk', () => {
  class TestProxygateError extends Error {
    code: string;
    action?: string;
    docs?: string;
    traceId?: string;
    constructor(code: string, message: string, opts: { action?: string } = {}) {
      super(message);
      this.code = code;
      this.action = opts.action;
    }
  }
  return { ProxygateError: TestProxygateError };
});

import { handleError } from './errors.js';
import { ProxygateError } from '@proxygate/sdk';

describe('handleError — Phase 51.5 free-tier error messages', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function runHandleError(err: unknown): string {
    try {
      handleError(err);
    } catch {
      // process.exit stub throws — swallow to allow output inspection.
    }
    return errSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
  }

  it('daily_free_cap renders friendly recovery hint', () => {
    const Err = ProxygateError as unknown as new (code: string, message: string, opts?: { action?: string }) => Error;
    const output = runHandleError(new Err('daily_free_cap', 'Daily free-tier limit reached for this listing or endpoint'));
    expect(output).toContain('Daily free limit reached');
    expect(output).toContain('Deposit USDC');
    expect(output).toContain('00:00 UTC');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('listing_quota_exhausted renders friendly recovery hint', () => {
    const Err = ProxygateError as unknown as new (code: string, message: string, opts?: { action?: string }) => Error;
    const output = runHandleError(new Err('listing_quota_exhausted', 'This free listing has reached its global daily quota'));
    expect(output).toContain('exhausted its global daily quota');
    expect(output).toContain('paid listing for the same service');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('error.action wins over the static hint map', () => {
    const Err = ProxygateError as unknown as new (code: string, message: string, opts?: { action?: string }) => Error;
    const output = runHandleError(new Err('daily_free_cap', 'Daily free-tier limit reached', { action: 'Custom action from gateway' }));
    expect(output).toContain('Custom action from gateway');
  });
});
