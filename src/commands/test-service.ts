import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import yaml from 'js-yaml';
import { bold, green, yellow, red, dim } from '../format.js';

interface TestEndpoint {
  method: string;
  path: string;
  description?: string;
}

interface TestService {
  name: string;
  port: number;
  endpoints?: TestEndpoint[];
  docs?: string;
}

interface TestResult {
  endpoint: string;
  method: string;
  status: number | null;
  latencyMs: number;
  contentType: string;
  isSSE: boolean;
  error: string | null;
}

async function testEndpoint(
  port: number,
  method: string,
  path: string,
  payload?: string,
): Promise<TestResult> {
  const url = `http://localhost:${port}${path}`;
  const start = performance.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const init: RequestInit = {
      method,
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
    };

    if (payload && method !== 'GET' && method !== 'HEAD') {
      init.body = payload;
    } else if (method === 'POST') {
      // Send minimal test body for POST endpoints
      init.body = JSON.stringify({ test: true });
    }

    const res = await fetch(url, init);
    clearTimeout(timeout);

    const latencyMs = Math.round(performance.now() - start);
    const contentType = res.headers.get('content-type') ?? '';
    const isSSE = contentType.includes('text/event-stream');

    // Consume body to validate it
    if (isSSE) {
      const text = await res.text();
      const chunks = text.split('\n\n').filter((c) => c.trim().startsWith('data:'));
      return {
        endpoint: `${method} ${path}`,
        method,
        status: res.status,
        latencyMs,
        contentType,
        isSSE: true,
        error: chunks.length === 0 ? 'SSE stream had no data chunks' : null,
      };
    } else {
      // Try to parse as JSON to validate
      const text = await res.text();
      if (contentType.includes('application/json')) {
        try {
          JSON.parse(text);
        } catch {
          return {
            endpoint: `${method} ${path}`,
            method,
            status: res.status,
            latencyMs,
            contentType,
            isSSE: false,
            error: 'Response has application/json content-type but body is not valid JSON',
          };
        }
      }

      return {
        endpoint: `${method} ${path}`,
        method,
        status: res.status,
        latencyMs,
        contentType,
        isSSE: false,
        error: null,
      };
    }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    const hint =
      message.includes('ECONNREFUSED') || message.includes('fetch failed')
        ? ` — is your server running on port ${port}?`
        : '';

    return {
      endpoint: `${method} ${path}`,
      method,
      status: null,
      latencyMs,
      contentType: '',
      isSSE: false,
      error: `${message}${hint}`,
    };
  }
}

function printResult(result: TestResult): void {
  const statusStr =
    result.status !== null
      ? result.status < 400
        ? green(`${result.status}`)
        : red(`${result.status}`)
      : red('ERR');

  console.log(`  ${bold(result.endpoint)}`);

  if (result.error) {
    console.log(`  ${red('FAIL')} ${result.error}`);
  } else {
    console.log(`  ${green('OK')}   ${statusStr} (${result.latencyMs}ms)`);
    if (result.isSSE) {
      console.log(`  ${green('OK')}   Valid SSE stream`);
    } else if (result.contentType.includes('application/json')) {
      console.log(`  ${green('OK')}   Valid JSON response`);
    }
  }
  console.log();
}

export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description('Test local services defined in proxygate.tunnel.yaml')
    .option('-c, --config <path>', 'Path to tunnel YAML config', 'proxygate.tunnel.yaml')
    .option('--payload <json>', 'Custom JSON payload for POST endpoints')
    .option('--endpoint <spec>', 'Test a single endpoint (e.g., "POST /v1/analyze")')
    .addHelpText(
      'after',
      '\nExamples:\n' +
        '  $ proxygate test\n' +
        '  $ proxygate test -c my-services.yaml\n' +
        '  $ proxygate test --endpoint "POST /v1/analyze" --payload \'{"code":"x=1"}\'\n',
    )
    .action(
      async (opts: { config: string; payload?: string; endpoint?: string }) => {
        try {
          // Load tunnel config
          const configPath = resolve(opts.config);
          let yamlContent: string;
          try {
            yamlContent = await readFile(configPath, 'utf-8');
          } catch {
            console.error(
              red(`Cannot read config: ${configPath}`),
            );
            console.error(dim('Create a proxygate.tunnel.yaml or use -c <path>.'));
            process.exit(1);
          }

          const config = yaml.load(yamlContent) as { services?: TestService[] };
          if (!config?.services?.length) {
            console.error(red('No services defined in config.'));
            process.exit(1);
          }

          console.log();
          console.log(
            dim(`Testing services from ${opts.config}...`),
          );
          console.log();

          let totalTests = 0;
          let failed = 0;

          for (const svc of config.services) {
            console.log(
              `${bold(`── ${svc.name}`)} ${dim(`(localhost:${svc.port})`)}`,
            );
            console.log();

            // Determine endpoints to test
            let endpoints: TestEndpoint[];
            if (opts.endpoint) {
              // Parse --endpoint flag: "POST /v1/analyze"
              const [method, ...pathParts] = opts.endpoint.split(' ');
              endpoints = [{ method: method ?? 'GET', path: pathParts.join(' ') || '/' }];
            } else if (svc.endpoints?.length) {
              endpoints = svc.endpoints;
            } else {
              // Fallback: health check
              endpoints = [{ method: 'GET', path: '/' }];
            }

            for (const ep of endpoints) {
              const result = await testEndpoint(
                svc.port,
                ep.method,
                ep.path,
                opts.payload,
              );
              printResult(result);

              totalTests++;
              if (result.error || (result.status !== null && result.status >= 400)) {
                failed++;
              }
            }

            // Warn if no docs
            if (!svc.docs) {
              console.log(
                `  ${yellow('!')}   No docs file configured — buyers won't see endpoint documentation`,
              );
              console.log(
                dim('      Add `docs: ./openapi.yaml` to your tunnel config'),
              );
              console.log();
            }
          }

          // Summary
          console.log('─'.repeat(40));
          if (failed === 0) {
            console.log(
              green(`All ${totalTests} endpoint${totalTests === 1 ? '' : 's'} passed.`) +
                ' Ready to go live:',
            );
            console.log(`  ${bold('proxygate tunnel')}`);
          } else {
            console.log(
              red(`${failed}/${totalTests} endpoint${totalTests === 1 ? '' : 's'} failed.`),
            );
            process.exit(1);
          }
          console.log();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(red(`Error: ${message}`));
          process.exit(1);
        }
      },
    );
}
