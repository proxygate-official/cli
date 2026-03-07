import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { serve } from '@hono/node-server';

const app = new OpenAPIHono();

// --- Schemas ---

const AnalyzeBody = z
  .object({
    input: z.unknown().openapi({ description: 'Data to analyze' }),
  })
  .openapi('AnalyzeRequest');

const AnalyzeResponse = z
  .object({
    input: z.unknown(),
    analysis: z.string(),
    timestamp: z.string().datetime(),
  })
  .openapi('AnalyzeResponse');

// --- Routes ---

const healthRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ status: z.string(), service: z.string() }) } },
      description: 'Health check',
    },
  },
});

app.openapi(healthRoute, (c) =>
  c.json({ status: 'ok', service: '{{name}}' }),
);

const analyzeRoute = createRoute({
  method: 'post',
  path: '/v1/analyze',
  request: {
    body: { content: { 'application/json': { schema: AnalyzeBody } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: AnalyzeResponse } },
      description: 'Analysis result',
    },
  },
});

app.openapi(analyzeRoute, async (c) => {
  const body = c.req.valid('json');

  const result = {
    input: body.input,
    analysis: 'This is a placeholder response from {{name}}.',
    timestamp: new Date().toISOString(),
  };

  return c.json(result);
});

// --- OpenAPI spec ---

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: '{{name}}', version: '0.1.0', description: '{{name}} API service' },
});

// --- Server ---

const port = {{port}};
console.log(`{{name}} listening on http://localhost:${port}`);
console.log(`OpenAPI spec: http://localhost:${port}/openapi.json`);
serve({ fetch: app.fetch, port });
