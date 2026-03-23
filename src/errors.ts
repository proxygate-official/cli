import { ProxyGateError } from '@proxygate/sdk';
import { red, dim } from './format.js';

/** Recovery hints for common gateway error codes. */
const ERROR_HINTS: Record<string, string> = {
  listing_not_found: 'Search available APIs: proxygate apis -q <name>',
  invalid_nonce: 'Nonce expired. Retry the request.',
  credits_exhausted: 'Deposit more USDC: proxygate deposit',
  vault_not_found: 'TX may not be confirmed yet — wait and retry. The vault auto-initializes on first deposit.',
  deposit_not_found: 'TX may still be confirming — wait and retry. Check on Solana Explorer.',
  skim_flagged: 'Your wallet has been flagged for vault skim protection. Contact support.',
  auth_required: 'Log in first: proxygate login --key pg_live_...',
  rate_limited: 'Too many requests. Wait and retry.',
  spend_limit_exceeded: 'Increase your spend limit at app.proxygate.ai/wallets',
  invalid_config: 'Run proxygate init or proxygate login to configure.',
  invalid_api_key: 'Check your API key: proxygate login --key pg_live_...',
};

/**
 * Centralized error handler for CLI commands.
 * Shows error code, message, actionable hint, docs URL, and trace ID.
 */
export function handleError(err: unknown): never {
  if (err instanceof ProxyGateError) {
    console.error(red(`Error [${err.code}]: ${err.message}`));
    const hint = err.action ?? ERROR_HINTS[err.code];
    if (hint) console.error(dim(`Suggestion: ${hint}`));
    if (err.docs) console.error(dim(`Docs: ${err.docs}`));
    if (err.traceId) console.error(dim(`Trace: ${err.traceId}`));
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(red(`Error: ${err.message}`));
    process.exit(1);
  }
  throw err;
}
