import { describe, it, expect, afterEach } from 'vitest';
import { startCallbackServer } from './localhost-server.js';
import type { CallbackResult } from './localhost-server.js';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('startCallbackServer', () => {
  it('starts server and receives callback with correct data', async () => {
    const handle = await startCallbackServer({ timeoutMs: 5000 });
    cleanup = handle.close;

    expect(handle.port).toBeGreaterThan(0);
    expect(handle.state).toHaveLength(32); // 16 bytes hex

    const res = await fetch(`http://127.0.0.1:${handle.port}/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state: handle.state,
        wallet: 'test-wallet-abc',
        delegation_token: 'pg_del_test123',
        expires_at: '2099-01-01T00:00:00Z',
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });

    const result: CallbackResult = await handle.waitForCallback();
    expect(result.wallet).toBe('test-wallet-abc');
    expect(result.delegation_token).toBe('pg_del_test123');
    expect(result.expires_at).toBe('2099-01-01T00:00:00Z');
  });

  it('rejects mismatched state with 403', async () => {
    const handle = await startCallbackServer({ timeoutMs: 5000 });
    cleanup = handle.close;

    const res = await fetch(`http://127.0.0.1:${handle.port}/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state: 'wrong-state-value',
        wallet: 'test-wallet',
        delegation_token: 'pg_del_test',
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'state_mismatch' });
  });

  it('times out after specified duration', async () => {
    const handle = await startCallbackServer({ timeoutMs: 100 });
    cleanup = handle.close;

    await expect(handle.waitForCallback()).rejects.toThrow('Timeout waiting for browser callback');
  });

  it('handles CORS preflight (OPTIONS request)', async () => {
    const handle = await startCallbackServer({ timeoutMs: 5000 });
    cleanup = handle.close;

    const res = await fetch(`http://127.0.0.1:${handle.port}/callback`, {
      method: 'OPTIONS',
    });

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });

  it('returns 404 for non-callback paths', async () => {
    const handle = await startCallbackServer({ timeoutMs: 5000 });
    cleanup = handle.close;

    const res = await fetch(`http://127.0.0.1:${handle.port}/unknown`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'not_found' });
  });

  it('returns 400 for invalid JSON body', async () => {
    const handle = await startCallbackServer({ timeoutMs: 5000 });
    cleanup = handle.close;

    const res = await fetch(`http://127.0.0.1:${handle.port}/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json{{{',
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'invalid_json' });
  });

  it('only includes string fields in result', async () => {
    const handle = await startCallbackServer({ timeoutMs: 5000 });
    cleanup = handle.close;

    await fetch(`http://127.0.0.1:${handle.port}/callback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state: handle.state,
        wallet: 123, // non-string — should be excluded
        delegation_token: 'pg_del_valid',
      }),
    });

    const result = await handle.waitForCallback();
    expect(result.wallet).toBeUndefined();
    expect(result.delegation_token).toBe('pg_del_valid');
  });
});
