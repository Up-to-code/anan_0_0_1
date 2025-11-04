import { NextRequest, NextResponse } from 'next/server';
import { getDefaultWhatsAppHandler } from '@/lib/config/whatsapp';
import { createAIWithPrompt } from '@/lib/config/ai';
import type { WebhookMessage } from '@/lib/libs/WhatsAppHandler';

// Store conversation history per user (in production, use Redis or database)
const conversationHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

/**
 * GET - Webhook verification
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query: Record<string, string> = {};
  
  searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const handler = getDefaultWhatsAppHandler();
  const result = handler.verifyWebhookRequest(query);

  if (result.success && result.challenge) {
    return new NextResponse(result.challenge, { status: 200 });
  }

  return NextResponse.json(
    { error: result.error || 'Verification failed' },
    { status: 403 }
  );
}

/**
 * POST - Handle webhook events
 */
export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-hub-signature-256') || undefined;
    const body = await request.json() as WebhookMessage;
 console.log(body);
    const handler = getDefaultWhatsAppHandler();

    // Set up message handler if not already set (do this before processing)
    handler.setWebhookHandlers({
      onMessage: async (message) => {
        try {
          // Mark message as read IMMEDIATELY when received
          if (message.id) {
            await handler.markAsRead(message.id).catch((err) => {
              console.error('Failed to mark message as read:', err);
            });
          }

          // Only process text messages
          if (message.type !== 'text' || !message.text?.body) {
            // Still mark non-text messages as read
            return;
          }

          const from = message.from;
          const userMessage = message.text.body;

          console.log(`📨 Received message from ${from}: ${userMessage.substring(0, 50)}...`);

          // Get or create conversation history
          let history = conversationHistory.get(from) || [];

          // Add user message to history
          history.push({ role: 'user', content: userMessage });

          // Limit history to last 20 messages to avoid token limits
          if (history.length > 20) {
            history = history.slice(-20);
          }

          // Create AI instance with WhatsApp-specific prompt
          const ai = createAIWithPrompt(
            `You are a friendly and helpful WhatsApp assistant. Your responses will be sent as replies (quoting the user's message), so they provide better context.

STYLE & TONE:
- Write in a natural, conversational style as if texting a friend
- Be warm, helpful, and professional
- Use emojis sparingly and appropriately (👍, ✅, ❤️, 😊, etc.)
- Keep messages concise - 2-4 sentences maximum per message
- Break long responses into multiple short messages if needed
- Use simple, clear language that's easy to understand
- Acknowledge what the user said before answering

FORMATTING:
- Use line breaks for readability
- Use bullet points (•) or numbers (1. 2. 3.) for lists
- Bold important parts with *asterisks*
- Keep paragraphs short (1-2 sentences)

COMMUNICATION:
- Always be helpful and solution-oriented
- Ask clarifying questions if needed
- Provide clear, actionable advice
- Reference the user's message naturally (e.g., "About your question...", "Regarding...")
- Be empathetic and understanding
- Avoid technical jargon unless the user asks for it
- When the user says thanks or acknowledges, keep your response brief

RESPONSE LENGTH:
- Keep each message under 300 words
- If you need to provide detailed information, break it into parts
- Use "Let me explain..." or "Here's what you need to know..." for longer explanations

Remember: Your messages are sent as replies, so users will see your response quoted to their message. Be helpful, be concise, and be human!`
          );

          // Restore conversation history
          history.forEach((msg) => {
            if (msg.role === 'user') {
              ai.addUserMessage(msg.content);
            } else {
              ai.addAssistantMessage(msg.content);
            }
          });

          // Get AI response (streaming for faster response)
          console.log(`🤖 Processing AI response for ${from}...`);
          let aiResponse = '';
          await ai.stream((chunk: string) => {
            aiResponse += chunk;
          }, { cache: true });

          // Add AI response to history
          history.push({ role: 'assistant', content: aiResponse });
          conversationHistory.set(from, history);

          // Determine appropriate reaction based on message content
          const messageLower = userMessage.toLowerCase().trim();
          
          // Detect message sentiment/type for appropriate reactions
          const isThanks = /^(thanks|thank you|ty|thank u|thx|tnx)$/i.test(messageLower);
          const isPositive = /^(yes|yeah|yep|yup|sure|great|awesome|nice|cool|perfect|excellent|amazing|love it)$/i.test(messageLower);
          const isAcknowledgment = /^(ok|okay|got it|understood|alright|sounds good)$/i.test(messageLower);

          // Send reply (quotes the original message) for better context
          console.log(`📤 Sending AI reply to ${from}...`);
          const sendResult = await handler.sendReply(
            from, 
            aiResponse, 
            message.id
          );
          console.log(`✅ Reply sent successfully. ID: ${sendResult.messages[0]?.id}`);

          // React appropriately based on message type
          // Use reactions for simple acknowledgments to keep conversation natural
          if (isThanks) {
            try {
              await handler.sendReaction(from, message.id, '❤️');
              console.log(`❤️ Reacted with love to thanks`);
            } catch (reactError) {
              console.error('Failed to send reaction:', reactError);
            }
          } else if (isPositive) {
            try {
              await handler.sendReaction(from, message.id, '👍');
              console.log(`👍 Reacted positively`);
            } catch (reactError) {
              console.error('Failed to send reaction:', reactError);
            }
          } else if (isAcknowledgment && aiResponse.length < 50) {
            // Only react if AI response is short (simple acknowledgment)
            try {
              await handler.sendReaction(from, message.id, '✅');
              console.log(`✅ Reacted to acknowledgment`);
            } catch (reactError) {
              console.error('Failed to send reaction:', reactError);
            }
          }
        } catch (error) {
          console.error('Error processing WhatsApp message:', error);
          
          // Send error message as reply to user
          try {
            if (message.id) {
              await handler.sendReply(
                message.from,
                'Sorry, I encountered an error processing your message. Please try again later.',
                message.id
              );
            } else {
              await handler.sendMessage(
                message.from,
                'Sorry, I encountered an error processing your message. Please try again later.'
              );
            }
          } catch (sendError) {
            console.error('Failed to send error message:', sendError);
          }
        }
      },
      onMessageStatus: (status) => {
        // Log message status updates with emojis
        const statusEmoji: Record<string, string> = {
          sent: '📤',
          delivered: '✓',
          read: '✓✓',
          failed: '❌',
        };
        const emoji = statusEmoji[status.status] || '📊';
        console.log(`${emoji} Message status: ${status.status}`, {
          id: status.id,
          recipient: status.recipient_id,
          timestamp: status.timestamp,
        });
      },
      onError: (error) => {
        console.error('Webhook error:', error);
      },
    });

    // Process the webhook request (signature verification is optional)
    // Only verify if both appSecret and signature are provided
    const shouldVerifySignature = process.env.WHATSAPP_APP_SECRET && signature;
    const result = await handler.processWebhookRequest(
      body, 
      shouldVerifySignature ? signature : undefined
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error('Webhook route error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

