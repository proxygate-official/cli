import type { CliConfig } from '../config.js';
import { red, dim } from '../format.js';

/**
 * Check whether a delegation token is expired or expiring soon.
 *
 * If expired, prints an error and exits. If expiring within 1 hour,
 * prints a warning and exits. Returns true if the token is still valid
 * or if no delegation token is configured.
 */
export function checkDelegationExpiry(config: CliConfig): boolean {
  if (!config.delegationToken || !config.delegationExpiresAt) return true;

  const expiresAt = new Date(config.delegationExpiresAt).getTime();
  const now = Date.now();
  const oneHour = 3600_000;

  if (now > expiresAt) {
    console.error(red('Delegation token expired.'));
    console.error(dim('Run `proxygate login` to re-authenticate.'));
    process.exit(1);
  }

  if (expiresAt - now < oneHour) {
    console.error(red('Delegation token expiring soon (< 1 hour).'));
    console.error(dim('Run `proxygate login` to re-authenticate.'));
    process.exit(1);
  }

  return true;
}
