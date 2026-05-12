import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerMetadataCommand } from './metadata.js';

describe('metadata command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = async (): Promise<void> => {
    const program = new Command('proxygate');
    registerMetadataCommand(program);
    await program.parseAsync(['node', 'proxygate', 'metadata']);
  };

  it('outputs valid JSON', async () => {
    await run();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.name).toBe('proxygate');
  });

  it('includes required fields', async () => {
    await run();

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed).toHaveProperty('name');
    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('sdk');
    expect(parsed).toHaveProperty('gateway');
    expect(parsed).toHaveProperty('chain', 'solana');
    expect(parsed).toHaveProperty('token', 'USDC');
    expect(parsed).toHaveProperty('auth', 'ed25519-wallet-signature');
  });

  it('includes pricing info', async () => {
    await run();

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    const pricing = parsed.pricing as Record<string, unknown>;
    expect(pricing.unit).toBe('micro-USDC');
    expect(pricing.minimum).toBe(1000);
    expect(pricing.minimum_usdc).toBe(0.001);
    expect(pricing.currency).toBe('USDC');
    expect(pricing.platform_fee_bps).toBe(500);
  });

  it('includes capabilities', async () => {
    await run();

    const parsed = JSON.parse(logSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    const caps = parsed.capabilities as Record<string, boolean>;
    expect(caps.proxy).toBe(true);
    expect(caps.tunnel).toBe(true);
    expect(caps.streaming).toBe(true);
    expect(caps.json_output).toBe(true);
  });
});
