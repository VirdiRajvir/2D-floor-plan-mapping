import { NextRequest } from 'next/server';

export const maxDuration = 60;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      messages: ChatMessage[];
      systemPrompt: string;
      context: string;
      apiKey: string;
      model?: string;
    };

    const { messages, systemPrompt, context, apiKey, model } = body;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No API key provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build the full messages array with system prompt + context
    const fullMessages: ChatMessage[] = [
      {
        role: 'system',
        content: `${systemPrompt}\n\n--- CURRENT APP CONTEXT ---\n${context}`,
      },
      ...messages,
    ];

    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });

    const stream = await client.chat.completions.create({
      model: model ?? 'gpt-4o-mini',
      messages: fullMessages,
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    });

    // Convert OpenAI stream to a ReadableStream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
