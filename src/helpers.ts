import { ProxyGateClient } from '@proxygate/sdk';
import { loadConfig } from './config.js';
import { red, dim } from './format.js';

/**
 * Resolve a ProxyGateClient from CLI flags or saved config.
 *
 * Exits with code 1 if neither config nor flags provide
 * the required gatewayUrl and keypairPath.
 */
export async function getClient(opts: {
  gateway?: string;
  keypair?: string;
}): Promise<ProxyGateClient> {
  const config = await loadConfig();
  const gatewayUrl = opts.gateway ?? config?.gatewayUrl;
  const keypairPath = opts.keypair ?? config?.keypairPath;

  if (!gatewayUrl || !keypairPath) {
    console.error(red('Error: Not configured. Run `proxygate init` first.'));
    console.error(dim('Or use --gateway and --keypair flags.'));
    process.exit(1);
  }

  return ProxyGateClient.create({ gatewayUrl, keypairPath });
}
