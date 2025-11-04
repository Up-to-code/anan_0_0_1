import { NextRequest, NextResponse } from 'next/server';
import { getDefaultWhatsAppHandler } from '@/lib/config/whatsapp';
import { processMessage } from '@/lib/processors/messageProcessor';
import type { WebhookMessage } from '@/lib/libs/WhatsAppHandler';
import { initializeDatabase } from '@/lib/db/init';
import { validateEnvironment } from '@/lib/config/validation';

// ==================== VERCEL LOGGING UTILITIES ====================
const VERCEL_ENV = process.env.VERCEL_ENV || 'development';
const IS_VERCEL = !!process.env.VERCEL;

function log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${VERCEL_ENV}] [${level.toUpperCase()}]`;
  
  if (data) {
    console[level === 'error' ? 'error' : 'log'](prefix, message, JSON.stringify(data, null, 2));
  } else {
    console[level === 'error' ? 'error' : 'log'](prefix, message);
  }
}

// Log initialization
log('info', '🚀 WhatsApp API Route Initializing', {
  isVercel: IS_VERCEL,
  environment: VERCEL_ENV,
  nodeVersion: process.version,
  region: process.env.VERCEL_REGION || 'unknown'
});

// Validate environment on startup
try {
  validateEnvironment();
  log('info', '✅ Environment validated successfully');
} catch (error) {
  log('error', '❌ Environment validation failed', {
    error: error instanceof Error ? error.message : String(error)
  });
}

// Initialize database on startup
try {
  initializeDatabase();
  log('info', '✅ Database initialized successfully');
} catch (error) {
  log('error', '❌ Database initialization failed', {
    error: error instanceof Error ? error.message : String(error)
  });
}

// ==================== TYPE DEFINITIONS ====================
interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive' | 'button' | 'list' | 'order' | 'system' | 'unknown';
  text?: { body: string };
  image?: { id: string; caption?: string };
  document?: { id: string; filename?: string; caption?: string };
  audio?: { id: string };
  video?: { id: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Array<Record<string, unknown>>;
  interactive?: {
    type: 'button_reply' | 'list_reply' | 'nfm_reply' | 'product' | 'product_list' | 'order';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
    nfm_reply?: { response_json?: Record<string, unknown>; body?: string };
  };
  button?: { text: string; payload: string };
  context?: {
    id: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
  };
  errors?: Array<{ code: number; title: string; message: string }>;
}

interface MessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipient_id: string;
  timestamp: string;
  conversation?: { id: string };
  pricing?: { pricing_model: string; billable: boolean; category: string };
  errors?: Array<{ code: number; title: string; message: string }>;
}

// ==================== HELPER FUNCTIONS ====================
function isUserMessage(message: WhatsAppMessage): boolean {
  return !!message.from && !message.from.includes('business');
}

function shouldProcessMessage(message: WhatsAppMessage): boolean {
  if (!isUserMessage(message)) return false;
  if (message.type === 'system') return false;
  
  if (message.type === 'text') {
    return !!(message.text?.body && message.text.body.trim() !== '');
  }
  
  if (message.type === 'interactive') {
    return !!(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title);
  }
  
  if (message.type === 'button' && message.button?.text) {
    return true;
  }
  
  return false;
}

function extractMessageContent(message: WhatsAppMessage): string | null {
  if (message.type === 'text' && message.text?.body) {
    return message.text.body.trim();
  }
  
  if (message.type === 'interactive') {
    if (message.interactive?.button_reply?.title) {
      return message.interactive.button_reply.title;
    }
    if (message.interactive?.list_reply?.title) {
      return message.interactive.list_reply.title;
    }
  }
  
  if (message.type === 'button' && message.button?.text) {
    return message.button.text;
  }
  
  return null;
}

function logMessageDetails(message: WhatsAppMessage): void {
  const content = extractMessageContent(message);
  const preview = content ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : 'No content';
  
  log('info', '📩 Message Details', {
    messageId: message.id,
    from: message.from,
    to: message.to,
    type: message.type,
    contentPreview: preview,
    timestamp: message.timestamp,
    hasContext: !!message.context,
    isForwarded: !!message.context?.forwarded,
    isUserMessage: isUserMessage(message),
    shouldProcess: shouldProcessMessage(message)
  });
}

function logStatusDetails(status: MessageStatus): void {
  const statusEmoji: Record<string, string> = {
    sent: '📤',
    delivered: '✓',
    read: '✓✓',
    failed: '❌',
  };
  
  const emoji = statusEmoji[status.status] || '📊';
  
  log('info', `${emoji} Message Status Update`, {
    statusId: status.id,
    status: status.status,
    recipientId: status.recipient_id,
    timestamp: status.timestamp,
    conversationId: status.conversation?.id,
    hasErrors: !!(status.errors && status.errors.length > 0),
    pricing: status.pricing
  });
  
  if (status.errors && status.errors.length > 0) {
    status.errors.forEach(error => {
      log('error', `❌ Message Error (${error.code})`, {
        title: error.title,
        message: error.message
      });
    });
  }
}

// ==================== GET HANDLER (Webhook Verification) ====================
export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  log('info', '🔍 GET Request Started', { requestId });
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const query: Record<string, string> = {};
    
    searchParams.forEach((value, key) => {
      query[key] = value;
    });

    log('info', '🔍 Webhook Verification Request', {
      requestId,
      mode: query['hub.mode'],
      hasToken: !!query['hub.verify_token'],
      hasChallenge: !!query['hub.challenge'],
      hasExpectedToken: !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    });

    if (!query['hub.mode'] && !query['hub.verify_token'] && !query['hub.challenge']) {
      log('info', 'ℹ️ Health Check Request', { requestId });
      return NextResponse.json({
        message: 'WhatsApp Webhook Endpoint',
        status: 'ready',
        environment: VERCEL_ENV,
        region: process.env.VERCEL_REGION || 'unknown',
        timestamp: new Date().toISOString()
      }, { status: 200 });
    }

    const handler = getDefaultWhatsAppHandler();
    const result = handler.verifyWebhookRequest(query);

    if (result.success && result.challenge) {
      log('info', '✅ Webhook Verified Successfully', { requestId });
      return new NextResponse(result.challenge, { status: 200 });
    }

    log('error', '❌ Webhook Verification Failed', {
      requestId,
      error: result.error
    });
    return NextResponse.json(
      { error: result.error || 'Verification failed' },
      { status: 403 }
    );
  } catch (error) {
    log('error', '❌ GET Request Error', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ==================== POST HANDLER (Webhook Processing) ====================
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  
  log('info', '🚀 POST Request Started', {
    requestId,
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'unknown'
  });
  
  try {
    const signature = request.headers.get('x-hub-signature-256') || undefined;
    
    log('info', '📋 Request Headers', {
      requestId,
      hasSignature: !!signature,
      contentType: request.headers.get('content-type'),
      userAgent: request.headers.get('user-agent')
    });
    
    // Parse request body
    let body: WebhookMessage;
    try {
      body = await request.json() as WebhookMessage;
      log('info', '✅ Request Body Parsed', {
        requestId,
        object: body.object,
        entryCount: body.entry?.length || 0,
        rawBody: JSON.stringify(body).substring(0, 500)
      });
    } catch (parseError) {
      log('error', '❌ Failed to Parse Request Body', {
        requestId,
        error: parseError instanceof Error ? parseError.message : String(parseError)
      });
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    
    // IMPORTANT: Respond to WhatsApp immediately with 200 to avoid retries
    // We'll process the message asynchronously after responding
    log('info', '⚡ Sending immediate 200 response to WhatsApp', { requestId });
    
    // Get WhatsApp handler
    const handler = getDefaultWhatsAppHandler();
    
    // Process webhook in the background (don't await)
    // Vercel will keep the function alive to complete this
    void (async () => {
      try {
        log('info', '🔄 Background processing started', { requestId });
        
        // Extract messages from webhook body
        const messages: Array<{ id: string; from: string; type?: string; text?: { body: string } }> = [];
        
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field === 'messages' && change.value?.messages) {
              messages.push(...change.value.messages);
            }
          }
        }
        
        log('info', '📨 Found messages to process', {
          requestId,
          count: messages.length,
          messageIds: messages.map(m => m.id)
        });
        
        // Process each message
        for (const message of messages) {
          const msgStartTime = Date.now();
          
          try {
            log('info', '🔔 Processing message', {
              requestId,
              messageId: message.id,
              from: message.from,
              type: message.type,
              hasText: !!message.text?.body
            });
            
            // Mark as read immediately
            if (message.id) {
              try {
                await handler.markAsRead(message.id);
                log('info', '✅ Message marked as read', {
                  requestId,
                  messageId: message.id
                });
              } catch (markError) {
                log('error', '❌ Failed to mark as read', {
                  requestId,
                  messageId: message.id,
                  error: markError instanceof Error ? markError.message : String(markError)
                });
              }
            }

            const whatsappMessage: WhatsAppMessage = {
              ...message,
              to: '',
              type: (message.type || 'unknown') as WhatsAppMessage['type']
            } as WhatsAppMessage;
            
            logMessageDetails(whatsappMessage);
            
            if (!shouldProcessMessage(whatsappMessage)) {
              log('info', '⏭️ Skipping message - not processable', {
                requestId,
                messageId: message.id
              });
              continue;
            }
            
            log('info', '🔄 Calling processMessage', {
              requestId,
              messageId: message.id
            });
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await processMessage(whatsappMessage as any, handler);
            
            const msgDuration = Date.now() - msgStartTime;
            log('info', '✅ Message processed successfully', {
              requestId,
              messageId: message.id,
              durationMs: msgDuration
            });
          } catch (error) {
            log('error', '❌ Error processing message', {
              requestId,
              messageId: message.id,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            
            // Try to send error message to user
            try {
              if (message.from) {
                await handler.sendMessage(
                  message.from,
                  'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى لاحقاً.'
                );
              }
            } catch (sendError) {
              log('error', '❌ Failed to send error message', {
                requestId,
                error: sendError instanceof Error ? sendError.message : String(sendError)
              });
            }
          }
        }
        
        const totalDuration = Date.now() - startTime;
        log('info', '✅ Background processing completed', {
          requestId,
          totalDurationMs: totalDuration,
          messagesProcessed: messages.length
        });
      } catch (bgError) {
        log('error', '❌ Background processing error', {
          requestId,
          error: bgError instanceof Error ? bgError.message : String(bgError),
          stack: bgError instanceof Error ? bgError.stack : undefined
        });
      }
    })();
    
    // Return immediate 200 response
    return NextResponse.json({ status: 'received' }, { status: 200 });
    
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    log('error', '❌ POST Request Error', {
      requestId,
      durationMs: duration,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}