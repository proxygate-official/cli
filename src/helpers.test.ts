import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
const mockConstructor = vi.fn();

vi.mock('@proxygate/sdk', () => {
  class MockClient {
    constructor(...args: unknown[]) {
      mockConstructor(...args);
    }
    static create(...args: unknown[]): MockClient {
      mockCreate(...args);
      return new MockClient();
    }
    proxy = {};
  }
  return {
    ProxygateClient: MockClient,
    parseKeypairBytes: () => new Uint8Array(64),
    encodeBase58: () => 'TestWalletBase58',
  };
});

vi.mock('tweetnacl', () => ({
  default: {
    sign: {
      keyPair: {
        fromSecretKey: () => ({ publicKey: new Uint8Array(32) }),
      },
    },
  },
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('[1,2,3]'),
}));

vi.mock('./config.js', () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from './config.js';
import { getClient } from './helpers.js';

const mockLoadConfig = vi.mocked(loadConfig);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getClient', () => {
  it('uses keypair-only path with flag overrides', async () => {
    mockLoadConfig.mockResolvedValue(null);
    await getClient({ gateway: 'http://flag-gw', keypair: '/flag/key.json' });
    expect(mockCreate).toHaveBeenCalledWith({
      gatewayUrl: 'http://flag-gw',
      keypairPath: '/flag/key.json',
    });
  });

  it('falls back to saved config (keypair mode)', async () => {
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

  it('creates apiKey-only client when no keypairPath', async () => {
    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      apiKey: 'pg_live_test_key_1234567890',
    });
    await getClient({});
    expect(mockConstructor).toHaveBeenCalledWith({
      gatewayUrl: 'http://gw',
      apiKey: 'pg_live_test_key_1234567890',
    });
  });

  it('creates dual-mode client when both apiKey and keypairPath', async () => {
    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      keypairPath: '/keys/id.json',
      apiKey: 'pg_live_test_key_1234567890',
    });
    await getClient({});
    expect(mockConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayUrl: 'http://gw',
        apiKey: 'pg_live_test_key_1234567890',
        walletAddress: 'TestWalletBase58',
      }),
    );
  });

  it('accepts --api-key flag override', async () => {
    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
    });
    await getClient({ apiKey: 'pg_live_override_12345678' });
    expect(mockConstructor).toHaveBeenCalledWith({
      gatewayUrl: 'http://gw',
      apiKey: 'pg_live_override_12345678',
    });
  });
});
