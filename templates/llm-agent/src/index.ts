import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { serve } from '@hono/node-server';
import OpenAI from 'openai';

const app = new Hono();
const openai = new OpenAI(); // Uses OPENAI_API_KEY env var

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: '{{name}}' }));

// Streaming code review endpoint
app.post('/v1/review', async (c) => {
  const { code, language } = await c.req.json<{ code: string; language?: string }>();

  if (!code) {
    return c.json({ error: 'Missing "code" field in request body' }, 400);
  }

  const stream = await openai.chat.completions.create({
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

// Non-streaming summarize endpoint
app.post('/v1/summarize', async (c) => {
  const { text, max_length } = await c.req.json<{ text: string; max_length?: number }>();

  if (!text) {
    return c.json({ error: 'Missing "text" field in request body' }, 400);
  }

  const response = await openai.chat.completions.create({
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

const port = {{port}};
console.log(`{{name}} listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
