import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerTestCommand } from './test-service.js';

const mockReadFile = vi.fn();
vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

const mockYamlLoad = vi.fn();
vi.mock('js-yaml', () => ({
  default: { load: (...args: unknown[]) => mockYamlLoad(...args) },
}));

// Mock global fetch
const mockFetch = vi.fn();

describe('test command', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Silence stderr; not asserted → not bound to a var.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const runTest = async (...args: string[]): Promise<void> => {
    const program = new Command('proxygate');
    registerTestCommand(program);
    await program.parseAsync(['node', 'proxygate', 'test', ...args]);
  };

  it('tests a service with defined endpoints', async () => {
    mockReadFile.mockResolvedValue('yaml-content');
    mockYamlLoad.mockReturnValue({
      services: [
        {
          name: 'my-api',
          port: 3000,
          endpoints: [
            { method: 'POST', path: '/v1/analyze', description: 'Analyze data' },
          ],
        },
      ],
    });

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ result: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await runTest();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('my-api');
    expect(output).toContain('200');
    expect(output).toContain('passed');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/analyze',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back to GET / health check when no endpoints defined', async () => {
    mockReadFile.mockResolvedValue('yaml');
    mockYamlLoad.mockReturnValue({
      services: [{ name: 'simple-svc', port: 4000 }],
    });

    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await runTest();

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:4000/',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reports failure when service is not reachable', async () => {
    mockReadFile.mockResolvedValue('yaml');
    mockYamlLoad.mockReturnValue({
      services: [{ name: 'dead-svc', port: 9999 }],
    });

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const exitCalls: number[] = [];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      exitCalls.push(code as number);
      return undefined as never;
    });

    await runTest();

    expect(exitCalls).toContain(1);
    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('FAIL');
    mockExit.mockRestore();
  });

  it('detects SSE streaming responses', async () => {
    mockReadFile.mockResolvedValue('yaml');
    mockYamlLoad.mockReturnValue({
      services: [
        {
          name: 'stream-svc',
          port: 3000,
          endpoints: [{ method: 'POST', path: '/v1/review' }],
        },
      ],
    });

    const sseBody = 'data: {"content":"hello"}\n\ndata: [DONE]\n\n';
    mockFetch.mockResolvedValue(
      new Response(sseBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    );

    await runTest();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('SSE');
  });

  it('warns when no docs file is referenced', async () => {
    mockReadFile.mockResolvedValue('yaml');
    mockYamlLoad.mockReturnValue({
      services: [{ name: 'no-docs', port: 3000 }],
    });

    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await runTest();

    const output = logSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(output).toContain('docs');
  });
});
