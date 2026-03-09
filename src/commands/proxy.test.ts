import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerProxyCommand } from './proxy.js';

const mockProxy = vi.fn();
vi.mock('@proxygate/sdk', () => ({
  ProxyGateClient: {
    create: vi.fn().mockResolvedValue({
      proxy: (...args: unknown[]) => mockProxy(...args),
    }),
  },
  ProxyGateError: class ProxyGateError extends Error {
    code: string;
    action?: string;
    constructor(gatewayError: { error: string; message: string; action?: string }, _statusCode: number) {
      super(gatewayError.message);
      this.code = gatewayError.error;
      this.action = gatewayError.action;
    }
  },
  parseSSE: vi.fn(),
  parseShieldInfo: vi.fn().mockReturnValue(null),
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gatewayUrl: 'http://localhost:3001',
    keypairPath: '/tmp/test-key.json',
  }),
}));

describe('proxy command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runProxy = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    program
      .option('--gateway <url>', 'Override gateway URL')
      .option('--keypair <path>', 'Override keypair path')
      .option('--json', 'Output raw JSON');
    registerProxyCommand(program);
    await program.parseAsync(['node', 'proxygate', 'proxy', ...args]);
  };

  it('sends a basic GET request when no --data is provided', async () => {
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runProxy('abc-123', '/v1/models');

    expect(mockProxy).toHaveBeenCalledWith('abc-123', '/v1/models', undefined, {
      method: 'GET',
      shield: undefined,
    });
  });

  it('sends POST with parsed JSON body when --data is provided', async () => {
    const body = { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] };
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'chatcmpl-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runProxy('abc-123', '/v1/chat/completions', '-d', JSON.stringify(body));

    expect(mockProxy).toHaveBeenCalledWith('abc-123', '/v1/chat/completions', body, {
      method: 'POST',
      shield: undefined,
    });
  });

  it('uses explicit method override with -X flag', async () => {
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runProxy('abc-123', '/v1/resource', '-d', '{"key":"val"}', '-X', 'PUT');

    expect(mockProxy).toHaveBeenCalledWith(
      'abc-123',
      '/v1/resource',
      { key: 'val' },
      { method: 'PUT', shield: undefined },
    );
  });

  it('exits with error for invalid JSON in --data', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runProxy('abc-123', '/v1/models', '-d', 'not-json')).rejects.toThrow(
      'process.exit',
    );

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Invalid JSON');
    mockExit.mockRestore();
  });

  it('outputs pretty-printed JSON for JSON responses', async () => {
    const payload = { id: 'chatcmpl-1', choices: [{ text: 'Hello' }] };
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runProxy('abc-123', '/v1/chat/completions');

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
  });

  it('outputs plain text for non-JSON responses', async () => {
    mockProxy.mockResolvedValue(
      new Response('plain text response', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    await runProxy('abc-123', '/v1/health');

    expect(logSpy).toHaveBeenCalledWith('plain text response');
  });

  it('prints status to stderr for non-200 responses', async () => {
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runProxy('abc-123', '/v1/missing');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Status: 404');
  });

  it('catches ProxyGateError and formats error with code and action', async () => {
    const { ProxyGateError } = await import('@proxygate/sdk');
    mockProxy.mockRejectedValue(new ProxyGateError(
      { error: 'CREDITS_EXHAUSTED', message: 'Insufficient credits', action: 'Deposit more USDC' },
      402,
    ));

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runProxy('abc-123', '/v1/chat/completions')).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('CREDITS_EXHAUSTED');
    expect(errOutput).toContain('Insufficient credits');
    expect(errOutput).toContain('Deposit more USDC');
    mockExit.mockRestore();
  });

  it('streams SSE events with --stream flag', async () => {
    const { parseSSE } = await import('@proxygate/sdk');
    const events = [{ data: '{"chunk":1}' }, { data: '{"chunk":2}' }, { data: '[DONE]' }];

    mockProxy.mockResolvedValue(
      new Response('stream body', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    vi.mocked(parseSSE).mockReturnValue(
      (async function* () {
        for (const e of events) {
          yield e;
        }
      })() as AsyncGenerator<{ data: string }>,
    );

    await runProxy('abc-123', '/v1/chat/completions', '-d', '{"model":"gpt-4"}', '--stream');

    // Should write chunk 1 and chunk 2 but stop at [DONE]
    expect(stdoutSpy).toHaveBeenCalledWith('{"chunk":1}\n');
    expect(stdoutSpy).toHaveBeenCalledWith('{"chunk":2}\n');
    // [DONE] should NOT be written
    expect(stdoutSpy).not.toHaveBeenCalledWith('[DONE]\n');
  });

  it('passes --shield mode to proxy options', async () => {
    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await runProxy('abc-123', '/v1/models', '--shield', 'strict');

    expect(mockProxy).toHaveBeenCalledWith('abc-123', '/v1/models', undefined, {
      method: 'GET',
      shield: 'strict',
    });
  });

  it('exits with error for invalid shield mode', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runProxy('abc-123', '/v1/models', '--shield', 'invalid')).rejects.toThrow(
      'process.exit',
    );

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Invalid shield mode');
    mockExit.mockRestore();
  });

  it('handles shield blocked response (422)', async () => {
    mockProxy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'response_blocked',
          code: 'shield_blocked',
          shield_score: 0.89,
          shield_flags: ['pi_and_jailbreak', 'malicious_uris'],
          refunded: true,
          message: 'Response blocked by Shield',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(runProxy('abc-123', '/v1/chat/completions', '--shield', 'strict')).rejects.toThrow(
      'process.exit',
    );

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Shield blocked');
    expect(errOutput).toContain('0.89');
    expect(errOutput).toContain('Credits refunded');
    mockExit.mockRestore();
  });

  it('displays shield info from response headers', async () => {
    const { parseShieldInfo } = await import('@proxygate/sdk');
    vi.mocked(parseShieldInfo).mockReturnValue({
      mode: 'monitored',
      score: 0.12,
      flags: 'none',
    });

    mockProxy.mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-ProxyGate-Shield': 'monitored',
          'X-ProxyGate-Shield-Score': '0.12',
          'X-ProxyGate-Shield-Flags': 'none',
        },
      }),
    );

    await runProxy('abc-123', '/v1/models', '--shield', 'monitor');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('Shield: monitored');
  });

  it('exits with error when streaming with no response body', async () => {
    mockProxy.mockResolvedValue(
      new Response(null, {
        status: 200,
      }),
    );

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });

    await expect(
      runProxy('abc-123', '/v1/chat/completions', '--stream'),
    ).rejects.toThrow('process.exit');

    const errOutput = errorSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .join('\n');
    expect(errOutput).toContain('No response body');
    mockExit.mockRestore();
  });
});
