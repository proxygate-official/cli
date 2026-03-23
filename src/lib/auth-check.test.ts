import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDelegationExpiry } from './auth-check.js';
import type { CliConfig } from '../config.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('checkDelegationExpiry', () => {
  it('returns true when no delegation token in config', () => {
    const config: CliConfig = { gatewayUrl: 'http://localhost:3001', keypairPath: '/k.json' };
    expect(checkDelegationExpiry(config)).toBe(true);
  });

  it('returns true when delegationToken set but delegationExpiresAt missing', () => {
    const config: CliConfig = {
      gatewayUrl: 'http://localhost:3001',
      delegationToken: 'pg_del_test',
    };
    expect(checkDelegationExpiry(config)).toBe(true);
  });

  it('exits when token is expired', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config: CliConfig = {
      gatewayUrl: 'http://localhost:3001',
      delegationToken: 'pg_del_expired',
      delegationExpiresAt: '2020-01-01T00:00:00Z',
    };

    expect(() => checkDelegationExpiry(config)).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('expired'));
  });

  it('exits when token expiring within 1 hour', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // 30 minutes from now — within the 1-hour threshold
    const soon = new Date(Date.now() + 30 * 60_000).toISOString();
    const config: CliConfig = {
      gatewayUrl: 'http://localhost:3001',
      delegationToken: 'pg_del_soon',
      delegationExpiresAt: soon,
    };

    expect(() => checkDelegationExpiry(config)).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('expiring soon'));
  });

  it('returns true when token has plenty of time left', () => {
    const config: CliConfig = {
      gatewayUrl: 'http://localhost:3001',
      delegationToken: 'pg_del_valid',
      delegationExpiresAt: '2099-12-31T23:59:59Z',
    };
    expect(checkDelegationExpiry(config)).toBe(true);
  });
});
