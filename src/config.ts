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
  keypairPath: string;
}

/**
 * Load CLI config from disk.
 * Returns null if the config file does not exist or cannot be parsed.
 */
export async function loadConfig(): Promise<CliConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'gatewayUrl' in parsed &&
      'keypairPath' in parsed &&
      typeof (parsed as CliConfig).gatewayUrl === 'string' &&
      typeof (parsed as CliConfig).keypairPath === 'string'
    ) {
      return parsed as CliConfig;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Save CLI config to disk.
 * Creates ~/.proxygate/ directory if it does not exist.
 */
export async function saveConfig(config: CliConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
