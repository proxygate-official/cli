import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: '{{name}}' }));

// Main endpoint — replace with your logic
app.post('/v1/analyze', async (c) => {
  const body = await c.req.json();

  // Your business logic here
  const result = {
    input: body,
    analysis: 'This is a placeholder response from {{name}}.',
    timestamp: new Date().toISOString(),
  };

  return c.json(result);
});

const port = {{port}};
console.log(`{{name}} listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
