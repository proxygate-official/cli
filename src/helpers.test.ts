import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock('./config.js', () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from './config.js';
import { getClient } from './helpers.js';

const mockLoadConfig = vi.mocked(loadConfig);

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockReturnValue({ proxy: {} });
});

describe('getClient', () => {
  it('uses flag overrides when provided', async () => {
    mockLoadConfig.mockResolvedValue(null);
    await getClient({ gateway: 'http://flag-gw', keypair: '/flag/key.json' });
    expect(mockCreate).toHaveBeenCalledWith({
      gatewayUrl: 'http://flag-gw',
      keypairPath: '/flag/key.json',
    });
  });

  it('falls back to saved config', async () => {
    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://saved-gw',
      keypairPath: '/saved/key.json',
    });
    await getClient({});
    expect(mockCreate).toHaveBeenCalledWith({
      gatewayUrl: 'http://saved-gw',
      keypairPath: '/saved/key.json',
    });
  });

  it('prefers flags over config', async () => {
    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://saved-gw',
      keypairPath: '/saved/key.json',
    });
    await getClient({ gateway: 'http://override-gw' });
    expect(mockCreate).toHaveBeenCalledWith({
      gatewayUrl: 'http://override-gw',
      keypairPath: '/saved/key.json',
    });
  });

  it('calls process.exit(1) when no config and no flags', async () => {
    mockLoadConfig.mockResolvedValue(null);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(getClient({})).rejects.toThrow('process.exit');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});
