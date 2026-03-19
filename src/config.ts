import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Directory where ProxyGate CLI stores config. */
export const CONFIG_DIR: string = join(homedir(), '.proxygate');

/** Full path to the CLI config file. */
export const CONFIG_PATH: string = join(CONFIG_DIR, 'config.json');

/** CLI configuration stored in ~/.proxygate/config.json. */
export interface CliConfig {
  gatewayUrl: string;
  keypairPath?: string;
  apiKey?: string;
}

/**
 * Load CLI config from disk.
 * Returns null if the config file does not exist or cannot be parsed.
 * Requires gatewayUrl and at least one auth method (keypairPath or apiKey).
 */
export async function loadConfig(): Promise<CliConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'gatewayUrl' in parsed &&
      typeof (parsed as Record<string, unknown>).gatewayUrl === 'string'
    ) {
      const obj = parsed as Record<string, unknown>;
      const hasKeypair = typeof obj.keypairPath === 'string';
      const hasApiKey = typeof obj.apiKey === 'string';

      if (!hasKeypair && !hasApiKey) return null;

      const config: CliConfig = { gatewayUrl: obj.gatewayUrl as string };
      if (hasKeypair) config.keypairPath = obj.keypairPath as string;
      if (hasApiKey) config.apiKey = obj.apiKey as string;
      return config;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Save CLI config to disk.
 * Creates ~/.proxygate/ directory if it does not exist.
 * Only writes defined fields (omits undefined values).
 */
export async function saveConfig(config: CliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  // Filter out undefined values
  const clean: Record<string, string> = { gatewayUrl: config.gatewayUrl };
  if (config.keypairPath) clean.keypairPath = config.keypairPath;
  if (config.apiKey) clean.apiKey = config.apiKey;
  await writeFile(CONFIG_PATH, JSON.stringify(clean, null, 2) + '\n', {
    encoding: 'utf-8',
    mode: 0o600,
  });
}
