import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import OpenAI from 'openai';

const app = new OpenAPIHono();

// Lazy-init so the server starts even without OPENAI_API_KEY set
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) _openai = new OpenAI();
  return _openai;
}

// --- Schemas ---

const ReviewBody = z
  .object({
    code: z.string().openapi({ description: 'Source code to review' }),
    language: z.string().optional().openapi({ description: 'Programming language' }),
  })
  .openapi('ReviewRequest');

const SummarizeBody = z
  .object({
    text: z.string().openapi({ description: 'Text to summarize' }),
    max_length: z.number().int().optional().openapi({ description: 'Max words (default 100)' }),
  })
  .openapi('SummarizeRequest');

const SummarizeResponse = z
  .object({
    summary: z.string(),
    model: z.string(),
    usage: z.unknown().optional(),
  })
  .openapi('SummarizeResponse');

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

const reviewRoute = createRoute({
  method: 'post',
  path: '/v1/review',
  request: {
    body: { content: { 'application/json': { schema: ReviewBody } }, required: true },
  },
  responses: {
    200: { description: 'SSE stream of review chunks', content: { 'text/event-stream': { schema: z.any() } } },
    400: { description: 'Missing code field' },
  },
});

app.openapi(reviewRoute, async (c) => {
  const { code, language } = c.req.valid('json');

  const stream = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    stream: true,
    messages: [
      {
        role: 'system',
        content: `You are a code reviewer. Review the following ${language ?? ''} code for bugs, style issues, and improvements. Be concise.`,
      },
      { role: 'user', content: code },
    ],
  });

  return streamSSE(c, async (sseStream) => {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        await sseStream.writeSSE({ data: JSON.stringify({ content }) });
      }
    }
    await sseStream.writeSSE({ data: '[DONE]' });
  });
});

const summarizeRoute = createRoute({
  method: 'post',
  path: '/v1/summarize',
  request: {
    body: { content: { 'application/json': { schema: SummarizeBody } }, required: true },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: SummarizeResponse } },
      description: 'Summary response',
    },
    400: { description: 'Missing text field' },
  },
});

app.openapi(summarizeRoute, async (c) => {
  const { text, max_length } = c.req.valid('json');

  const response = await openai().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Summarize the following text in ${max_length ?? 100} words or fewer.`,
      },
      { role: 'user', content: text },
    ],
  });

  return c.json({
    summary: response.choices[0]?.message?.content ?? '',
    model: response.model,
    usage: response.usage,
  });
});

// --- OpenAPI spec ---

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: '{{name}}', version: '0.1.0', description: '{{name}} — LLM-powered agent' },
});

// --- Server ---

const port = {{port}};
console.log(`{{name}} listening on http://localhost:${port}`);
console.log(`OpenAPI spec: http://localhost:${port}/openapi.json`);
serve({ fetch: app.fetch, port });
