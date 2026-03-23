import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';

export interface CallbackResult {
  wallet?: string;
  delegation_token?: string;
  api_key?: string;
  expires_at?: string;
}

interface ServerHandle {
  port: number;
  state: string;
  url: string;
  waitForCallback: () => Promise<CallbackResult>;
  close: () => void;
}

/**
 * Start a localhost HTTP server that listens for a browser callback.
 *
 * Binds to 127.0.0.1 on a random port. The browser POSTs JSON to /callback
 * with a `state` field that must match the generated CSRF token.
 */
export async function startCallbackServer(opts?: { timeoutMs?: number }): Promise<ServerHandle> {
  const timeoutMs = opts?.timeoutMs ?? 300_000; // 5 minutes
  const state = randomBytes(16).toString('hex');

  let resolvePromise: (result: CallbackResult) => void;
  let rejectPromise: (err: Error) => void;
  const promise = new Promise<CallbackResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;

  const server: Server = createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/callback') {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as Record<string, unknown>;

          if (payload.state !== state) {
            res.writeHead(403, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify({ error: 'state_mismatch' }));
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ ok: true }));

          const result: CallbackResult = {};
          if (typeof payload.wallet === 'string') result.wallet = payload.wallet;
          if (typeof payload.delegation_token === 'string') result.delegation_token = payload.delegation_token;
          if (typeof payload.api_key === 'string') result.api_key = payload.api_key;
          if (typeof payload.expires_at === 'string') result.expires_at = payload.expires_at;

          resolvePromise(result);
        } catch {
          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify({ error: 'invalid_json' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  return new Promise<ServerHandle>((resolveServer, rejectServer) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        rejectServer(new Error('Failed to bind server'));
        return;
      }

      const port = addr.port;

      timer = setTimeout(() => {
        rejectPromise(new Error('Timeout waiting for browser callback'));
        server.close();
      }, timeoutMs);

      resolveServer({
        port,
        state,
        url: `http://127.0.0.1:${port}`,
        waitForCallback: () => promise,
        close: () => {
          if (timer) clearTimeout(timer);
          server.close();
        },
      });
    });

    server.on('error', (err) => {
      rejectServer(err);
    });
  });
}
