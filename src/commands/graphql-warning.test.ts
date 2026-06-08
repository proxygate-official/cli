import { describe, it, expect } from 'vitest';
import { GRAPHQL_PROXY_PATH } from '@proxygate/api-types';
import { graphqlErrorWarning } from './graphql-warning.js';

// Strip ANSI codes so assertions match regardless of color env. Build the
// pattern from the ESC char code so the source has no control character
// (a literal \x1b in a regex trips eslint no-control-regex).
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const plain = (s: string | null): string => (s ?? '').replace(ANSI, '');

describe('graphqlErrorWarning', () => {
  it('warns when the GraphQL path returns a non-empty errors array', () => {
    const out = graphqlErrorWarning(GRAPHQL_PROXY_PATH, {
      errors: [{ message: 'Field "foo" not found' }],
    });
    expect(out).not.toBeNull();
    expect(plain(out)).toContain('GraphQL returned 1 error(s)');
    expect(plain(out)).toContain('HTTP status is 200');
    expect(plain(out)).toContain('Field "foo" not found');
    expect(plain(out)).toContain('billed for this call');
  });

  it('returns null when the GraphQL body has no errors', () => {
    const out = graphqlErrorWarning(GRAPHQL_PROXY_PATH, { data: { ok: true } });
    expect(out).toBeNull();
  });

  it('returns null for an empty errors array', () => {
    const out = graphqlErrorWarning(GRAPHQL_PROXY_PATH, { errors: [] });
    expect(out).toBeNull();
  });

  it('still warns on partial data + errors (valid GraphQL, billed)', () => {
    const out = graphqlErrorWarning(GRAPHQL_PROXY_PATH, {
      data: { user: null },
      errors: [{ message: 'Not authorized' }],
    });
    expect(out).not.toBeNull();
    expect(plain(out)).toContain('Not authorized');
  });

  it('does not warn for a REST path even with an errors array', () => {
    const out = graphqlErrorWarning('/v1/chat/completions', {
      errors: [{ message: 'boom' }],
    });
    expect(out).toBeNull();
  });

  it('returns null when the parsed body is not an object', () => {
    expect(graphqlErrorWarning(GRAPHQL_PROXY_PATH, 'plain text')).toBeNull();
    expect(graphqlErrorWarning(GRAPHQL_PROXY_PATH, null)).toBeNull();
    expect(graphqlErrorWarning(GRAPHQL_PROXY_PATH, 42)).toBeNull();
  });

  it('reports the error count without messages when none are strings', () => {
    const out = graphqlErrorWarning(GRAPHQL_PROXY_PATH, { errors: [{}, {}] });
    expect(out).not.toBeNull();
    expect(plain(out)).toContain('GraphQL returned 2 error(s)');
  });
});
