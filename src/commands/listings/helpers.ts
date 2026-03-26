import type { CreateListingOptions, ListingAuthPattern } from '@proxygate/sdk';
import { handleError } from '../../errors.js';
import { bold, red, green, dim } from '../../format.js';

/** Truncate a string to N chars, adding "..." if truncated. */
export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
}

/**
 * Print method-aware test results to the console.
 *
 * - GET success (validation_type: 'full'): "OK" with green status
 * - Non-GET success (validation_type: 'auth_only'): "AUTH OK" with dim status
 * - Failures: "FAIL" with red status; 403 shows WAF/CDN hint
 */
export interface TestResultsDisplay {
  test_results?: Array<{
    success: boolean;
    status?: number;
    status_text?: string;
    latency_ms: number;
    error?: string;
    endpoint: { method: string; path: string };
    validation_type: 'full' | 'auth_only';
  }>;
  test_passed?: boolean;
}

export function printTestResults(result: TestResultsDisplay): void {
  const test_results = result.test_results;
  const test_passed = result.test_passed;
  if (!test_results || !Array.isArray(test_results) || test_results.length === 0) return;

  console.log();
  console.log(bold('Endpoint Tests:'));

  for (const tr of test_results) {
    const label = `${tr.endpoint.method} ${tr.endpoint.path}`;

    if (tr.error) {
      console.log(`  ${red('FAIL')}  ${bold(label)}`);
      console.log(`         ${dim(tr.error)}`);
      continue;
    }

    if (tr.success && tr.validation_type === 'auth_only') {
      console.log(`  ${green('AUTH OK')}  ${bold(label)}  ${dim('(' + (tr.status ?? '?') + ')')}  ${dim(tr.latency_ms + 'ms')}`);
    } else if (tr.success && tr.validation_type === 'full') {
      console.log(`  ${green('OK')}  ${bold(label)}  ${green(String(tr.status ?? '?'))}  ${dim(tr.latency_ms + 'ms')}`);
    } else {
      console.log(`  ${red('FAIL')}  ${bold(label)}  ${red(String(tr.status ?? '?'))}  ${dim(tr.latency_ms + 'ms')}`);
      if (tr.status === 403) {
        console.log(`         ${dim('Tip: If your API uses a WAF/CDN, try --skip-test')}`);
      }
    }
  }

  if (test_passed === false) {
    console.log();
    console.log(red('Some endpoint tests failed. Listing is inactive.'));
    console.log(dim('Fix and retry with: proxygate listings test <id>'));
  }
}

export { handleError };

/** Lazy-load @inquirer/prompts to avoid import overhead for non-interactive use. */
export async function loadPrompts(): Promise<typeof import('@inquirer/prompts')> {
  return import('@inquirer/prompts');
}

/** Prompt for auth credentials based on auth pattern. */
export async function promptCredentials(authPattern: ListingAuthPattern): Promise<
  Partial<
    Pick<
      CreateListingOptions,
      | 'api_key'
      | 'header_name'
      | 'query_param'
      | 'basic_user'
      | 'oauth2_flow_type'
      | 'oauth2_token_url'
      | 'oauth2_scopes'
      | 'oauth2_client_id'
      | 'oauth2_client_secret'
      | 'oauth2_service_account_json'
    >
  >
> {
  const { input, password, select } = await loadPrompts();

  if (authPattern === 'bearer' || authPattern === 'header' || authPattern === 'query' || authPattern === 'basic') {
    const result: Partial<CreateListingOptions> = {};

    if (authPattern === 'header') {
      result.header_name = await input({ message: 'Header name (e.g. X-Api-Key):' });
    }
    if (authPattern === 'query') {
      result.query_param = await input({ message: 'Query parameter name (e.g. api_key):' });
    }
    if (authPattern === 'basic') {
      result.basic_user = await input({ message: 'Basic auth username:' });
    }

    result.api_key = await password({ message: 'API key:' });
    return result;
  }

  // oauth2_cc
  const flowType = await select<'standard' | 'google_jwt'>({
    message: 'OAuth2 flow type:',
    choices: [
      { value: 'standard', name: 'Standard (client_credentials)' },
      { value: 'google_jwt', name: 'Google JWT (service account)' },
    ],
  });

  const result: Partial<CreateListingOptions> = { oauth2_flow_type: flowType };

  if (flowType === 'standard') {
    result.oauth2_token_url = await input({ message: 'Token URL:' });
    result.oauth2_scopes = await input({ message: 'Scopes (space-separated):' });
    result.oauth2_client_id = await password({ message: 'Client ID:' });
    result.oauth2_client_secret = await password({ message: 'Client secret:' });
  } else {
    result.oauth2_service_account_json = await input({
      message: 'Path to service account JSON:',
    });
  }

  return result;
}
