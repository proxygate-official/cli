import type { Command } from 'commander';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

/** Machine-readable project metadata for coding agents. */
export function registerMetadataCommand(program: Command): void {
  program
    .command('metadata')
    .description('Machine-readable project metadata (for AI agents and tooling)')
    .action(() => {
      console.log(JSON.stringify({
        name: 'proxygate',
        version,
        description: 'API marketplace for AI agents — buy and sell API access with USDC on Solana',
        type: 'api-marketplace',
        cli: '@proxygate/cli',
        sdk: '@proxygate/sdk',
        gateway: 'https://gateway.proxygate.ai',
        docs: 'https://gateway.proxygate.ai/docs',
        agents_md: 'https://github.com/jwelten/proxygate/blob/main/AGENTS.md',
        chain: 'solana',
        token: 'USDC',
        auth: 'ed25519-wallet-signature',
        config_path: '~/.proxygate/config.json',
        keypair_path: '~/.proxygate/keypair.json',
        listing_types: ['proxy', 'tunnel', 'skill', 'product', 'dataset', 'service', 'connector'],
        auth_patterns: ['none', 'bearer', 'header', 'query', 'basic', 'oauth2_cc'],
        categories: ['ai', 'finance', 'data', 'weather', 'location', 'health', 'security', 'devtools', 'media', 'travel', 'crypto'],
        pricing: {
          unit: 'lamports',
          minimum: 10000,
          minimum_usdc: 0.01,
          currency: 'USDC',
          platform_fee_bps: 500,
        },
        exit_codes: {
          0: 'success',
          1: 'cli_error',
          2: 'auth_error',
          3: 'insufficient_credits',
          4: 'upstream_error',
          5: 'rate_limited',
        },
        capabilities: {
          proxy: true,
          tunnel: true,
          streaming: true,
          shield: true,
          per_token_billing: true,
          json_output: true,
          non_interactive: true,
        },
      }, null, 2));
    });
}
