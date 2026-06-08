import { GRAPHQL_PROXY_PATH } from '@proxygate/api-types';
import { yellow, dim } from '../format.js';

/**
 * GraphQL returns HTTP 200 even when the query fails: the failure lives in an
 * `errors` array inside the JSON body, not in the status code. An agent that
 * only checks `response.ok` would miss it (and is still billed for the call).
 *
 * Given the request path and the already-parsed response body, returns a
 * stderr warning string when the call targeted the GraphQL proxy path and the
 * body carries a non-empty `errors` array, or null otherwise.
 *
 * Only applies to the non-streaming path. GraphQL subscriptions stream SSE
 * events rather than a single JSON body, so this check cannot run there.
 */
export function graphqlErrorWarning(path: string, parsed: unknown): string | null {
  if (path !== GRAPHQL_PROXY_PATH) return null;
  if (typeof parsed !== 'object' || parsed === null) return null;

  const errors = (parsed as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;

  // Partial `data` + `errors` is valid GraphQL, so do not treat a populated
  // `data` field as a success — the errors still need surfacing.
  const messages = errors
    .map((e) => (typeof e === 'object' && e !== null ? (e as { message?: unknown }).message : undefined))
    .filter((m): m is string => typeof m === 'string')
    .slice(0, 3);

  const detail = messages.length > 0 ? `: ${messages.join('; ')}` : '';
  return (
    yellow(`GraphQL returned ${errors.length} error(s) (HTTP status is 200)${detail}`) +
    '\n' +
    dim('Check the response body for the `errors` array, not just the status code. You are billed for this call regardless.')
  );
}
