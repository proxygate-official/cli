import type { CreateListingOptions, ListingAuthPattern } from '@proxygate/sdk';
import { ProxyGateError } from '@proxygate/sdk';
import { red, dim } from '../../format.js';

/** Truncate a string to N chars, adding "..." if truncated. */
export function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 3) + '...' : str;
}

/** Standard error handler matching existing CLI pattern. */
export function handleError(err: unknown): never {
  if (err instanceof ProxyGateError) {
    console.error(red(`Error [${err.code}]: ${err.message}`));
    if (err.action) console.error(dim(`Suggestion: ${err.action}`));
    process.exit(1);
  }
  if (err instanceof Error) {
    console.error(red(`Error: ${err.message}`));
    process.exit(1);
  }
  throw err;
}

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
