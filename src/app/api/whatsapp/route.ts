import { NextRequest, NextResponse } from 'next/server';
import { getDefaultWhatsAppHandler } from '@/lib/config/whatsapp';
import { processMessage } from '@/lib/processors/messageProcessor';
import type { WebhookMessage } from '@/lib/libs/WhatsAppHandler';
import { initializeDatabase } from '@/lib/db/init';
import { validateEnvironment } from '@/lib/config/validation';

// Validate environment on startup
validateEnvironment();

// Initialize database on startup
initializeDatabase();

// Enhanced interfaces for better type safety
interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'contacts' | 'interactive' | 'button' | 'list' | 'order' | 'system' | 'unknown';
  text?: {
    body: string;
  };
  image?: {
    id: string;
    caption?: string;
  };
  document?: {
    id: string;
    filename?: string;
    caption?: string;
  };
  audio?: {
    id: string;
  };
  video?: {
    id: string;
    caption?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{
    addresses?: Array<{
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
      country_code?: string;
      type?: string;
    }>;
    birthday?: string;
    emails?: Array<{
      email?: string;
      type?: string;
    }>;
    name?: {
      formatted_name?: string;
      first_name?: string;
      last_name?: string;
      middle_name?: string;
      suffix?: string;
      prefix?: string;
    };
    org?: {
      company?: string;
      department?: string;
      title?: string;
    };
    phones?: Array<{
      phone?: string;
      wa_id?: string;
      type?: string;
    }>;
    urls?: Array<{
      url?: string;
      type?: string;
    }>;
  }>;
  interactive?: {
    type: 'button_reply' | 'list_reply' | 'nfm_reply' | 'product' | 'product_list' | 'order';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
    nfm_reply?: {
      response_json?: Record<string, unknown>;
      body?: string;
    };
  };
  button?: {
    text: string;
    payload: string;
  };
  list?: {
    id: string;
    title: string;
    description?: string;
  };
  order?: {
    catalog_id: string;
    product_items: Array<{
      product_retailer_id: string;
      quantity: number;
      item_price: number;
      currency: string;
    }>;
    text?: string;
  };
  system?: {
    type: 'user_changed_number' | 'user_completed_chat' | 'customer_feedback';
    body: string;
    new_wa_id?: string;
  };
  context?: {
    id: string;
    forwarded?: boolean;
    frequently_forwarded?: boolean;
    from?: string;
    referred_product?: {
      catalog_id: string;
      product_retailer_id: string;
    };
  };
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

interface MessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  recipient_id: string;
  timestamp: string;
  conversation?: {
    id: string;
    origin: {
      type: string;
    };
  };
  pricing?: {
    pricing_model: string;
    billable: boolean;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

interface WebhookChange {
  id: string;
  field: 'messages' | 'message_template_status_update' | 'account_update' | 'phone_number_name_update' | 'phone_number_quality_update';
  value: {
    messaging_product: 'whatsapp';
    metadata?: {
      display_phone_number: string;
    };
    messages?: WhatsAppMessage[];
    statuses?: MessageStatus[];
      [key: string]: unknown;
  };
}

interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

interface EnhancedWebhookMessage {
  object: 'whatsapp_business_account';
  entry: WebhookEntry[];
}

// Helper function to check if message is from a user (not from our business)
function isUserMessage(message: WhatsAppMessage): boolean {
  // Check if message has a 'from' field (user messages do)
  return !!message.from && !message.from.includes('business');
}

// Helper function to check if message should be processed
function shouldProcessMessage(message: WhatsAppMessage): boolean {
  // Only process messages from users
  if (!isUserMessage(message)) return false;
  
  // Skip system messages
  if (message.type === 'system') return false;
  
  // Process text messages
  if (message.type === 'text') {
    if (!message.text?.body) return false;
    if (message.text.body.trim() === '') return false;
    return true;
  }
  
  // Process interactive messages (button replies, list replies)
  if (message.type === 'interactive') {
    if (message.interactive?.button_reply?.title || message.interactive?.list_reply?.title) {
      return true;
    }
    return false;
  }
  
  // Process button messages
  if (message.type === 'button' && message.button?.text) {
    return true;
  }
  
  return false;
}

// Helper function to extract message content
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

// Helper function to log message details
function logMessageDetails(message: WhatsAppMessage): void {
  const content = extractMessageContent(message);
  const preview = content ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : 'No content';
  
  console.log('📩 Message details:', {
    id: message.id,
    from: message.from,
    to: message.to,
    type: message.type,
    content: preview,
    timestamp: message.timestamp,
    hasContext: !!message.context,
    isForwarded: !!message.context?.forwarded,
    isUserMessage: isUserMessage(message),
    shouldProcess: shouldProcessMessage(message)
  });
}

// Helper function to log status details
function logStatusDetails(status: MessageStatus): void {
  const statusEmoji: Record<string, string> = {
    sent: '📤',
    delivered: '✓',
    read: '✓✓',
    failed: '❌',
  };
  
  const emoji = statusEmoji[status.status] || '📊';
  
  console.log(`${emoji} Message status update:`, {
    id: status.id,
    status: status.status,
    recipient: status.recipient_id,
    timestamp: status.timestamp,
    conversationId: status.conversation?.id,
    hasErrors: !!(status.errors && status.errors.length > 0),
    pricing: status.pricing ? {
      model: status.pricing.pricing_model,
      billable: status.pricing.billable,
      category: status.pricing.category
    } : null
  });
  
  // Log errors if any
  if (status.errors && status.errors.length > 0) {
    status.errors.forEach(error => {
      console.error(`❌ Message error (${error.code}): ${error.title} - ${error.message}`);
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query: Record<string, string> = {};
    
    searchParams.forEach((value, key) => {
      query[key] = value;
    });

    console.log('🔍 Webhook verification request:', {
      mode: query['hub.mode'],
      token: query['hub.verify_token'] ? '***' + query['hub.verify_token'].slice(-4) : 'missing',
      challenge: query['hub.challenge'] ? 'present' : 'missing',
      expectedToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ? '***' + process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN.slice(-4) : 'missing'
    });

    // If no hub parameters, return helpful message
    if (!query['hub.mode'] && !query['hub.verify_token'] && !query['hub.challenge']) {
      return NextResponse.json({
        message: 'WhatsApp Webhook Endpoint',
        status: 'ready',
        info: 'This endpoint should be called by Meta/Facebook with verification parameters',
        expectedParams: ['hub.mode', 'hub.verify_token', 'hub.challenge']
      }, { status: 200 });
    }

    const handler = getDefaultWhatsAppHandler();
    const result = handler.verifyWebhookRequest(query);

    if (result.success && result.challenge) {
      console.log('✅ Webhook verified successfully');
      return new NextResponse(result.challenge, { status: 200 });
    }

    console.log('❌ Webhook verification failed:', result.error);
    return NextResponse.json(
      { error: result.error || 'Verification failed' },
      { status: 403 }
    );
  } catch (error) {
    console.error('❌ GET request error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  console.log('🚀 ========== POST /api/whatsapp STARTED ==========');
  console.log('⏰ Timestamp:', new Date().toISOString());
  
  try {
    const signature = request.headers.get('x-hub-signature-256') || undefined;
    console.log('📋 Headers:', {
      hasSignature: !!signature,
      contentType: request.headers.get('content-type'),
      userAgent: request.headers.get('user-agent')
    });
    
    // Parse body as WebhookMessage (same as working route)
    let body: WebhookMessage;
    try {
      body = await request.json() as WebhookMessage;
      console.log('✅ Request body parsed successfully');
      console.log('📨 Received webhook:', {
        object: body.object,
        entryCount: body.entry?.length || 0,
        messages: body.entry?.reduce((acc, entry) => 
          acc + (entry.changes.find(c => c.field === 'messages')?.value.messages?.length || 0), 0) || 0,
        statuses: body.entry?.reduce((acc, entry) => 
          acc + (entry.changes.find(c => c.field === 'messages')?.value.statuses?.length || 0), 0) || 0
      });
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    
    console.log('🔧 Getting WhatsApp handler...');
    const handler = getDefaultWhatsAppHandler();
    console.log('✅ Handler obtained');

    // Set handlers BEFORE processing (same pattern as working route)
    console.log('🔗 Setting webhook handlers...');
    handler.setWebhookHandlers({
      onMessage: async (message) => {
        console.log('🔔 ========== onMessage HANDLER CALLED ==========');
        console.log('🔔 onMessage handler called:', {
          messageId: message.id,
          from: message.from,
          type: message.type,
          hasText: !!message.text?.body,
          timestamp: message.timestamp
        });
        
        try {
          // MARK AS READ IMMEDIATELY when message arrives
          if (message.id) {
            console.log('✅ Marking message as read:', message.id);
            try {
              const markResult = await handler.markAsRead(message.id);
              console.log('✅ Message marked as read successfully:', message.id, 'Result:', markResult);
            } catch (markError) {
              console.error('❌ Failed to mark message as read:', markError);
              if (markError instanceof Error) {
                console.error('Mark error details:', markError.message, markError.stack);
              }
              // Don't throw - continue processing even if mark fails
            }
          } else {
            console.warn('⚠️ Message has no ID, cannot mark as read');
          }

          // Convert to our WhatsAppMessage format (add 'to' field if missing)
          const whatsappMessage: WhatsAppMessage = {
            ...message,
            to: (message as Record<string, unknown>).to as string || '',
            type: (message.type || 'unknown') as WhatsAppMessage['type']
          } as WhatsAppMessage;
          
          // Log message details
          logMessageDetails(whatsappMessage);
          
          // Check if we should process this message
          if (!shouldProcessMessage(whatsappMessage)) {
            console.log('⏭️ Skipping message - not processable:', {
              type: whatsappMessage.type,
              isUserMessage: isUserMessage(whatsappMessage)
            });
            return;
          }
          
          // Process the message
          console.log('🔄 Processing message:', message.id);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await processMessage(whatsappMessage as any, handler);
          console.log('✅ Message processed successfully');
        } catch (error) {
          console.error('❌ Error processing message:', error);
          
          // Enhanced error logging
          if (error instanceof Error) {
            console.error('Error stack:', error.stack);
          }
          
          // Try to send error message to user
          try {
            const errorMessage = 'عذراً، حدث خطأ في معالجة رسالتك. يرجى المحاولة مرة أخرى لاحقاً.';
            const messageFrom = message?.from;
            if (messageFrom) {
              console.log('📤 Sending error message to:', messageFrom);
              await handler.sendMessage(messageFrom, errorMessage);
              console.log('✅ Error message sent to user');
            } else {
              console.error('❌ Cannot send error message: missing from field');
            }
          } catch (sendError) {
            console.error('❌ Failed to send error message:', sendError);
            if (sendError instanceof Error) {
              console.error('Send error details:', sendError.message, sendError.stack);
            }
          }
        }
        console.log('🔔 ========== onMessage HANDLER COMPLETED ==========');
      },
      onMessageStatus: (status) => {
        console.log('🔔 onMessageStatus handler called:', {
          statusId: status.id,
          status: status.status,
          recipient: status.recipient_id,
          timestamp: status.timestamp
        });
        try {
          logStatusDetails(status as MessageStatus);
        } catch (error) {
          console.error('❌ Error logging status:', error);
        }
      },
      onError: (error) => {
        console.error('❌ Webhook handler error:', error);
        if (error instanceof Error) {
          console.error('Error details:', {
            message: error.message,
            stack: error.stack
          });
        }
      },
    });
    console.log('✅ Handlers set successfully');

    // Process the webhook request (exactly like working route)
    const shouldVerifySignature = process.env.WHATSAPP_APP_SECRET && signature;
    console.log('🔐 Signature verification:', {
      shouldVerify: shouldVerifySignature,
      hasAppSecret: !!process.env.WHATSAPP_APP_SECRET,
      hasSignature: !!signature
    });
    
    console.log('📞 Calling processWebhookRequest...');
    const result = await handler.processWebhookRequest(
      body, 
      shouldVerifySignature ? signature : undefined
    );
    
    console.log('🚀 ========== POST /api/whatsapp COMPLETED ==========');
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    console.error('🚀 ========== POST /api/whatsapp ERROR ==========');
    console.error('❌ POST request error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    
    console.error('🚀 ========== POST /api/whatsapp ERROR END ==========');
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}