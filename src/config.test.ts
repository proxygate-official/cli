import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadConfig, saveConfig, CONFIG_DIR, CONFIG_PATH } from './config.js';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadConfig', () => {
  it('returns null when file does not exist (ENOENT)', async () => {
    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    expect(await loadConfig()).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    mockReadFile.mockResolvedValue('not valid json{{{' as never);
    expect(await loadConfig()).toBeNull();
  });

  it('returns null when neither keypairPath nor apiKey present', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ gatewayUrl: 'http://localhost' }) as never);
    expect(await loadConfig()).toBeNull();
  });

  it('returns valid config with keypairPath only', async () => {
    const config = { gatewayUrl: 'http://localhost:3001', keypairPath: '/home/user/.config/solana/id.json' };
    mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
    const result = await loadConfig();
    expect(result).toEqual(config);
  });

  it('returns valid config with apiKey only', async () => {
    const config = { gatewayUrl: 'http://localhost:3001', apiKey: 'pg_live_test_1234567890' };
    mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
    const result = await loadConfig();
    expect(result).toEqual(config);
  });

  it('returns valid config with both keypairPath and apiKey', async () => {
    const config = { gatewayUrl: 'http://localhost:3001', keypairPath: '/keys/id.json', apiKey: 'pg_live_test_1234567890' };
    mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
    const result = await loadConfig();
    expect(result).toEqual(config);
  });

  it('returns config with delegation token fields', async () => {
    const config = {
      gatewayUrl: 'http://localhost:3001',
      delegationToken: 'pg_del_test123',
      wallet: 'test-wallet-abc',
      delegationExpiresAt: '2099-01-01T00:00:00Z',
    };
    mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
    const result = await loadConfig();
    expect(result).toEqual(config);
  });

  it('accepts delegation token as valid auth (no keypair/apiKey)', async () => {
    const config = { gatewayUrl: 'http://localhost:3001', delegationToken: 'pg_del_only' };
    mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
    const result = await loadConfig();
    expect(result).not.toBeNull();
    expect(result!.delegationToken).toBe('pg_del_only');
  });
});

describe('saveConfig', () => {
  it('creates directory and writes JSON', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = { gatewayUrl: 'http://localhost:3001', keypairPath: '/keys/id.json' };
    await saveConfig(config);

    expect(mockMkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true, mode: 0o700 });
    expect(mockWriteFile).toHaveBeenCalledWith(
      CONFIG_PATH,
      expect.stringContaining('"gatewayUrl"'),
      { encoding: 'utf-8', mode: 0o600 },
    );
  });

  it('writes expected format (2-space indent + trailing newline)', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = { gatewayUrl: 'https://gw.proxygate.io', keypairPath: '~/.config/solana/id.json' };
    await saveConfig(config);

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('  "gatewayUrl"');
    expect(written.endsWith('\n')).toBe(true);
  });

  it('omits undefined fields', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = { gatewayUrl: 'http://localhost:3001', apiKey: 'pg_live_test_1234567890' };
    await saveConfig(config);

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('"apiKey"');
    expect(written).not.toContain('"keypairPath"');
  });

  it('writes apiKey alongside keypairPath (dual mode)', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = { gatewayUrl: 'http://localhost', keypairPath: '/k.json', apiKey: 'pg_live_test_1234567890' };
    await saveConfig(config);

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('"apiKey"');
    expect(written).toContain('"keypairPath"');
  });

  it('persists delegation token, wallet, and delegationExpiresAt', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = {
      gatewayUrl: 'http://localhost:3001',
      delegationToken: 'pg_del_persist',
      wallet: 'wallet-xyz',
      delegationExpiresAt: '2099-06-15T12:00:00Z',
    };
    await saveConfig(config);

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('"delegationToken"');
    expect(written).toContain('pg_del_persist');
    expect(written).toContain('"wallet"');
    expect(written).toContain('wallet-xyz');
    expect(written).toContain('"delegationExpiresAt"');
    expect(written).toContain('2099-06-15T12:00:00Z');
  });

  it('omits undefined delegation fields', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = { gatewayUrl: 'http://localhost:3001', apiKey: 'pg_live_test_abc' };
    await saveConfig(config);

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).not.toContain('"delegationToken"');
    expect(written).not.toContain('"wallet"');
    expect(written).not.toContain('"delegationExpiresAt"');
  });
});
