import { NextRequest } from 'next/server';
import { createAIWithPrompt } from '@/lib/config/ai';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory, stream } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a new model instance for this request
    const model = createAIWithPrompt('ASSISTANT');

    // Restore conversation history if provided
    if (conversationHistory && Array.isArray(conversationHistory)) {
      conversationHistory.forEach((msg: { role: string; content: string }) => {
        if (msg.role === 'user') {
          model.addUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          model.addAssistantMessage(msg.content);
        }
      });
    }

    // Add current user message
    model.addUserMessage(message);

    // Always use streaming for faster response
    if (stream !== false) {
      // Create a ReadableStream for SSE
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let fullContent = '';

            await model.stream(
              (chunk: string) => {
                fullContent += chunk;
                
                // Send chunk to client immediately
                const data = JSON.stringify({ 
                  type: 'chunk', 
                  content: chunk 
                });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              },
              { cache: true } // Enable caching for faster responses
            );

            // Send completion signal
            const completionData = JSON.stringify({
              type: 'done',
              content: fullContent,
            });
            controller.enqueue(encoder.encode(`data: ${completionData}\n\n`));
            controller.close();
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Streaming error';
            const errorData = JSON.stringify({
              type: 'error',
              error: errorMessage,
            });
            controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable buffering for faster streaming
        },
      });
    } else {
      // Non-streaming fallback (faster than before with caching)
      const response = await model.send({ cache: true });
      
      return new Response(
        JSON.stringify({
          content: response.content,
          usage: response.usage,
          model: response.model,
          success: true,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error: unknown) {
    console.error('AI API Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process AI request';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false,
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

