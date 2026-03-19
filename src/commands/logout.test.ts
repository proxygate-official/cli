import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
  saveConfig: vi.fn(),
  CONFIG_PATH: '~/.proxygate/config.json',
}));

vi.mock('../format.js', () => ({
  green: (s: string) => s,
  dim: (s: string) => s,
}));

import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config.js';
import { registerLogoutCommand } from './logout.js';

const mockLoadConfig = vi.mocked(loadConfig);
const mockSaveConfig = vi.mocked(saveConfig);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registerLogoutCommand', () => {
  it('registers logout command without throwing', () => {
    const program = new Command();
    expect(() => registerLogoutCommand(program)).not.toThrow();
  });

  it('does nothing when no apiKey in config', async () => {
    const program = new Command();
    program.exitOverride();
    registerLogoutCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      keypairPath: '/keys/id.json',
    });

    await program.parseAsync(['logout'], { from: 'user' });

    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  it('does nothing when config is null', async () => {
    const program = new Command();
    program.exitOverride();
    registerLogoutCommand(program);

    mockLoadConfig.mockResolvedValue(null);

    await program.parseAsync(['logout'], { from: 'user' });

    expect(mockSaveConfig).not.toHaveBeenCalled();
  });

  it('removes apiKey while preserving keypairPath', async () => {
    const program = new Command();
    program.exitOverride();
    registerLogoutCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      keypairPath: '/keys/id.json',
      apiKey: 'pg_live_test_key_1234567890',
    });
    mockSaveConfig.mockResolvedValue(undefined);

    await program.parseAsync(['logout'], { from: 'user' });

    expect(mockSaveConfig).toHaveBeenCalledWith({
      gatewayUrl: 'http://gw',
      keypairPath: '/keys/id.json',
    });
  });

  it('saves gatewayUrl only when apiKey was the sole auth method', async () => {
    const program = new Command();
    program.exitOverride();
    registerLogoutCommand(program);

    mockLoadConfig.mockResolvedValue({
      gatewayUrl: 'http://gw',
      apiKey: 'pg_live_test_key_1234567890',
    });
    mockSaveConfig.mockResolvedValue(undefined);

    await program.parseAsync(['logout'], { from: 'user' });

    expect(mockSaveConfig).toHaveBeenCalledWith({
      gatewayUrl: 'http://gw',
    });
  });
});
