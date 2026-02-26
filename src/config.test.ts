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

  it('returns null when required fields are missing', async () => {
    mockReadFile.mockResolvedValue(JSON.stringify({ gatewayUrl: 'http://localhost' }) as never);
    expect(await loadConfig()).toBeNull();
  });

  it('returns valid CliConfig when file is correct', async () => {
    const config = { gatewayUrl: 'http://localhost:3001', keypairPath: '/home/user/.config/solana/id.json' };
    mockReadFile.mockResolvedValue(JSON.stringify(config) as never);
    const result = await loadConfig();
    expect(result).toEqual(config);
  });
});

describe('saveConfig', () => {
  it('creates directory and writes JSON', async () => {
    mockMkdir.mockResolvedValue(undefined as never);
    mockWriteFile.mockResolvedValue(undefined as never);

    const config = { gatewayUrl: 'http://localhost:3001', keypairPath: '/keys/id.json' };
    await saveConfig(config);

    expect(mockMkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      CONFIG_PATH,
      JSON.stringify(config, null, 2) + '\n',
      'utf-8',
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
});
