import { ProxygateError } from '@proxygate/sdk';
import { red, dim } from './format.js';

/** Recovery hints for common gateway error codes. */
const ERROR_HINTS: Record<string, string> = {
  listing_not_found: 'Search available APIs: proxygate apis -q <name>',
  invalid_nonce: 'Nonce expired. Retry the request.',
  credits_exhausted: 'Deposit more USDC: proxygate deposit',
  vault_not_found: 'TX may not be confirmed yet. Wait and retry. The vault auto-initializes on first deposit.',
  deposit_not_found: 'TX may still be confirming. Wait and retry. Check on Solana Explorer.',
  skim_flagged: 'Your wallet has been flagged for vault skim protection. Contact support.',
  auth_required: 'Log in first: proxygate login --key pg_live_...',
  rate_limited: 'Too many requests. Wait and retry.',
  spend_limit_exceeded: 'Increase your spend limit at app.proxygate.ai/wallets',
  // Spend-limit blocks (429). Surfaced distinctly by the proxy command; this
  // hint covers any other path that lets a SpendLimitError reach handleError.
  daily_spend_limit_exceeded: 'This call would exceed your daily spend limit. Adjust it in the Proxygate web app under Wallets > Limits.',
  per_tx_spend_limit_exceeded: 'This call would exceed your per-transaction spend limit. Adjust it in the Proxygate web app under Wallets > Limits.',
  invalid_config: 'Run proxygate init or proxygate login to configure.',
  invalid_api_key: 'Check your API key: proxygate login --key pg_live_...',
  // Phase 51.5: free-tier rate-limit errors. These fire on procured listings
  // (e.g. Open-Meteo) when the per-wallet or global daily cap is hit. Resets
  // at 00:00 UTC. To keep going immediately, deposit USDC and call a paid
  // listing for the same service.
  daily_free_cap: 'Daily free limit reached for this listing. Deposit USDC for unlimited paid calls, or wait until 00:00 UTC.',
  listing_quota_exhausted: 'This free listing has exhausted its global daily quota. Try a paid listing for the same service, or wait until 00:00 UTC.',
};

/**
 * Centralized error handler for CLI commands.
 * Shows error code, message, actionable hint, docs URL, and trace ID.
 */
export function handleError(err: unknown): never {
  if (err instanceof ProxygateError) {
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
