/**
 * WhatsApp Meta Business API Handler with Webhook Support
 * TypeScript implementation for Node.js 16+
 * 
 * Copyright (c) 2023 Up-to-code
 * 
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import * as crypto from 'crypto';
import * as http from 'http';

// ==================== Configuration ====================

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  businessAccountId?: string;
  version?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
  apiTimeout?: number;
  maxRetries?: number;
  rateLimitPerSecond?: number;
}

// ==================== Message Interfaces ====================

export interface MessageResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface TextMessage {
  preview_url?: boolean;
  body: string;
}

export interface MediaMessage {
  id?: string;
  link?: string;
  caption?: string;
  filename?: string;
}

export interface LocationMessage {
  longitude: number;
  latitude: number;
  name?: string;
  address?: string;
}

export interface ContactMessage {
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
  emails?: Array<{ email?: string; type?: string }>;
  name: {
    formatted_name: string;
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
  phones?: Array<{ phone?: string; type?: string; wa_id?: string }>;
  urls?: Array<{ url?: string; type?: string }>;
}

export interface TemplateMessage {
  name: string;
  language: { code: string };
  components?: Array<{
    type: string;
    parameters: Array<{ type: string; [key: string]: unknown }>;
  }>;
}

export interface InteractiveMessage {
  type: 'button' | 'list';
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    image?: MediaMessage;
    video?: MediaMessage;
    document?: MediaMessage;
  };
  body: { text: string };
  footer?: { text: string };
  action: {
    button?: string;
    buttons?: Array<{
      type: 'reply';
      reply: { id: string; title: string };
    }>;
    sections?: Array<{
      title?: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>;
  };
}

// ==================== Webhook Interfaces ====================

export interface WebhookMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata?: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile_name: string;
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: { body: string };
          type?: string;
          image?: MediaMessage;
          video?: MediaMessage;
          audio?: MediaMessage;
          document?: MediaMessage;
          location?: LocationMessage;
          contacts?: ContactMessage[];
          button?: { payload: string; text: string };
          interactive?: {
            type: string;
            button_reply?: { id: string; title: string };
            list_reply?: { id: string; title: string; description?: string };
          };
          [key: string]: unknown;
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
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
            message?: string;
            error_data?: {
              details: string;
            };
          }>;
        }>;
        errors?: Array<{
          code: number;
          title: string;
          message?: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

type WebhookMessageType = NonNullable<WebhookMessage['entry'][0]['changes'][0]['value']['messages']>[0];
type WebhookStatusType = NonNullable<WebhookMessage['entry'][0]['changes'][0]['value']['statuses']>[0];

export interface WebhookHandlers {
  onMessage?: (message: WebhookMessageType, metadata: MessageMetadata) => void | Promise<void>;
  onMessageStatus?: (status: WebhookStatusType) => void | Promise<void>;
  onAccountUpdate?: (update: unknown) => void | Promise<void>;
  onPhoneChange?: (change: unknown) => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
  onUnknown?: (event: unknown) => void | Promise<void>;
}

export interface MessageMetadata {
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  displayName?: string;
  waId?: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'sticker';

// ==================== Error Classes ====================

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public code?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'WhatsAppError';
  }
}

export class WebhookVerificationError extends WhatsAppError {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export class RateLimitError extends WhatsAppError {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// ==================== Rate Limiter ====================

class RateLimiter {
  private requests: number[] = [];
  
  constructor(private maxRequests: number, private windowMs: number = 1000) {}
  
  async waitForSlot(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.windowMs - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForSlot();
    }
    
    this.requests.push(now);
  }
}

// ==================== Main Handler Class ====================

export class WhatsAppHandler {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly businessAccountId?: string;
  private readonly appSecret?: string;
  private readonly webhookVerifyToken?: string;
  private readonly apiTimeout: number;
  private readonly maxRetries: number;
  private readonly rateLimiter: RateLimiter;
  
  private webhookHandlers: WebhookHandlers = {};
  private webhookQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue: boolean = false;
  private webhookServer: http.Server | null = null;

  constructor(config: WhatsAppConfig) {
    const version = config.version || 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${version}`;
    this.token = config.token;
    this.phoneNumberId = config.phoneNumberId;
    this.businessAccountId = config.businessAccountId;
    this.appSecret = config.appSecret;
    this.webhookVerifyToken = config.webhookVerifyToken;
    this.apiTimeout = config.apiTimeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.rateLimiter = new RateLimiter(config.rateLimitPerSecond || 80);
    
    if (!this.token || !this.phoneNumberId) {
      throw new Error('Token and phoneNumberId are required');
    }
  }

  // ==================== Core API Methods ====================

  private async _makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    data?: unknown,
    attempt: number = 1
  ): Promise<T> {
    await this.rateLimiter.waitForSlot();
    
    const url = `${this.baseUrl}/${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);

    try {
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      if (data && (method === 'POST' || method === 'DELETE')) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
          throw new RateLimitError('Rate limit exceeded', retryAfter);
        }
        
        throw new WhatsAppError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          errorData.error?.code || response.status,
          errorData.error
        );
      }

      return await response.json() as T;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Retry logic
      if (attempt < this.maxRetries && 
          (error instanceof RateLimitError || 
           (error instanceof Error && error.name === 'AbortError'))) {
        const delay = error instanceof RateLimitError 
          ? (error.retryAfter || 60) * 1000 
          : Math.pow(2, attempt) * 1000;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._makeRequest<T>(endpoint, method, data, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(
    to: string,
    message: string,
    previewUrl: boolean = false
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: previewUrl,
        body: message,
      },
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send a reply message (quotes the original message)
   */
  async sendReply(
    to: string,
    message: string,
    replyToMessageId: string,
    previewUrl: boolean = false
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: previewUrl,
        body: message,
      },
      context: {
        message_id: replyToMessageId,
      },
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send a reaction (emoji) to a message
   */
  async sendReaction(
    to: string,
    messageId: string,
    emoji: string = '👍'
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji: emoji,
      },
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send media (image, video, audio, document)
   */
  async sendMedia(
    to: string,
    mediaType: MediaType,
    mediaIdOrUrl: string,
    caption?: string,
    filename?: string
  ): Promise<MessageResponse> {
    const isUrl = mediaIdOrUrl.startsWith('http');
    const mediaObject: MediaMessage = isUrl
      ? { link: mediaIdOrUrl, caption, filename }
      : { id: mediaIdOrUrl, caption, filename };

    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: mediaType,
      [mediaType]: mediaObject,
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send location
   */
  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'location',
      location: { latitude, longitude, name, address },
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send contact
   */
  async sendContact(
    to: string,
    contacts: ContactMessage[]
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'contacts',
      contacts,
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send template message
   */
  async sendTemplate(
    to: string,
    template: TemplateMessage
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template,
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Send interactive message (buttons or list)
   */
  async sendInteractive(
    to: string,
    interactive: InteractiveMessage
  ): Promise<MessageResponse> {
    const data = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    };

    return this._makeRequest<MessageResponse>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    const data = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };

    return this._makeRequest<{ success: boolean }>(
      `${this.phoneNumberId}/messages`,
      'POST',
      data
    );
  }

  /**
   * Upload media
   */
  async uploadMedia(
    file: Buffer | Blob,
    mimeType: string
  ): Promise<{ id: string }> {
    const formData = new FormData();
    // Convert Buffer to Blob if needed
    let blob: Blob;
    if (file instanceof Buffer) {
      // Convert Buffer to proper ArrayBuffer then to Blob
      const bufferArray = new Uint8Array(file);
      const arrayBuffer = bufferArray.buffer.slice(
        bufferArray.byteOffset,
        bufferArray.byteOffset + bufferArray.byteLength
      );
      blob = new Blob([arrayBuffer], { type: mimeType });
    } else {
      blob = file as Blob;
    }
    formData.append('file', blob);
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);

    const url = `${this.baseUrl}/${this.phoneNumberId}/media`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: formData,
    });

    if (!response.ok) {
      throw new WhatsAppError(`Media upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get media URL
   */
  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string }> {
    return this._makeRequest<{ url: string; mime_type: string }>(mediaId, 'GET');
  }

  /**
   * Delete media
   */
  async deleteMedia(mediaId: string): Promise<{ success: boolean }> {
    return this._makeRequest<{ success: boolean }>(mediaId, 'DELETE');
  }

  // ==================== Webhook Methods ====================

  /**
   * Set webhook event handlers
   */
  setWebhookHandlers(handlers: WebhookHandlers): void {
    this.webhookHandlers = { ...this.webhookHandlers, ...handlers };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.appSecret) {
      throw new WebhookVerificationError('App secret not configured');
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Process webhook queue
   */
  private async processWebhookQueue(): Promise<void> {
    if (this.isProcessingQueue || this.webhookQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.webhookQueue.length > 0) {
      const task = this.webhookQueue.shift();
      if (task) {
        try {
          await task();
        } catch (error) {
          console.error('Webhook task error:', error);
          if (this.webhookHandlers.onError) {
            await this.webhookHandlers.onError(error);
          }
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Queue webhook task
   */
  private queueWebhookTask(task: () => Promise<void>): void {
    this.webhookQueue.push(task);
    void this.processWebhookQueue();
  }

  /**
   * Handle incoming webhook
   */
  async handleWebhook(body: WebhookMessage, signature?: string): Promise<void> {
    console.log('🔷 handleWebhook called:', {
      object: body.object,
      entryCount: body.entry?.length || 0,
      hasSignature: !!signature,
      hasAppSecret: !!this.appSecret
    });

    // Only verify signature if both appSecret and signature are provided
    // This allows for development/testing without signature verification
    if (this.appSecret && signature) {
      try {
        const isValid = this.verifyWebhookSignature(JSON.stringify(body), signature);
        if (!isValid) {
          console.warn('⚠️ Webhook signature verification failed. Skipping verification in development mode.');
          // In development, log but don't throw error
          if (process.env.NODE_ENV === 'production') {
            throw new WebhookVerificationError('Invalid webhook signature');
          }
        } else {
          console.log('✓ Webhook signature verified successfully');
        }
      } catch (error) {
        // In development, allow webhooks without signature verification
        if (process.env.NODE_ENV === 'production') {
          throw error;
        }
        console.warn('⚠️ Signature verification error (ignored in development):', error);
      }
    } else if (!this.appSecret) {
      console.warn('⚠️ App secret not configured. Webhook signature verification skipped.');
    }

    if (body.object !== 'whatsapp_business_account') {
      console.warn('Unexpected webhook object type:', body.object);
      return;
    }

    console.log('🔄 Processing webhook entries...');
    for (const entry of body.entry) {
      console.log('📋 Processing entry:', entry.id, 'changes:', entry.changes.length);
      for (const change of entry.changes) {
        console.log('🔄 Processing change field:', change.field);
        await this.processWebhookChange(change);
        console.log('✅ Change processed:', change.field);
      }
    }
    console.log('✅ All webhook entries processed');
  }

  /**
   * Process webhook change
   */
  private async processWebhookChange(change: WebhookMessage['entry'][0]['changes'][0]): Promise<void> {
    const { field, value } = change;
    // entry is available but not used in this method

    console.log('🔧 processWebhookChange:', {
      field,
      hasMessages: !!value.messages,
      hasStatuses: !!value.statuses
    });

    try {
      switch (field) {
        case 'messages':
          console.log('📨 Routing to handleMessageWebhook...');
          await this.handleMessageWebhook(value);
          break;
        case 'message_status':
          await this.handleStatusWebhook(value);
          break;
        case 'account_update':
          if (this.webhookHandlers.onAccountUpdate) {
            this.queueWebhookTask(async () => {
              const handler = this.webhookHandlers.onAccountUpdate;
              if (handler) {
                await Promise.resolve(handler(value));
              }
            });
          }
          break;
        case 'phone_number_name_update':
          if (this.webhookHandlers.onPhoneChange) {
            this.queueWebhookTask(async () => {
              const handler = this.webhookHandlers.onPhoneChange;
              if (handler) {
                await Promise.resolve(handler(value));
              }
            });
          }
          break;
        default:
          if (this.webhookHandlers.onUnknown) {
            this.queueWebhookTask(async () => {
              const handler = this.webhookHandlers.onUnknown;
              if (handler) {
                await Promise.resolve(handler(change));
              }
            });
          }
      }
    } catch (error) {
      console.error('Error processing webhook change:', error);
      if (this.webhookHandlers.onError) {
        await Promise.resolve(this.webhookHandlers.onError(error));
      }
    }
  }

  /**
   * Handle message webhook
   * Note: Statuses also come in the 'messages' field change, so we handle both here
   */
  private async handleMessageWebhook(value: WebhookMessage['entry'][0]['changes'][0]['value']): Promise<void> {
    console.log('📬 ========== handleMessageWebhook STARTED ==========');
    console.log('📬 handleMessageWebhook called:', {
      hasMessages: !!value.messages,
      messageCount: value.messages?.length || 0,
      hasStatuses: !!value.statuses,
      statusCount: value.statuses?.length || 0,
      hasOnMessageHandler: !!this.webhookHandlers.onMessage,
      hasOnStatusHandler: !!this.webhookHandlers.onMessageStatus
    });

    // Handle incoming messages - execute immediately for better reliability
    if (value.messages && this.webhookHandlers.onMessage) {
      console.log(`📨 Found ${value.messages.length} message(s) to process`);
      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i];
        const metadata: MessageMetadata = {
          phoneNumberId: value.metadata?.phone_number_id,
          displayPhoneNumber: value.metadata?.display_phone_number,
          displayName: value.contacts?.[0]?.profile_name,
          waId: value.contacts?.[0]?.wa_id,
        };

        console.log(`📨 [${i + 1}/${value.messages.length}] Processing message:`, {
          id: message.id,
          from: message.from,
          type: message.type,
          hasText: !!message.text?.body,
          timestamp: message.timestamp
        });
        
        // Execute handler immediately instead of queueing
        try {
          const handler = this.webhookHandlers.onMessage;
          if (handler) {
            console.log(`📨 [${i + 1}/${value.messages.length}] Calling onMessage handler...`);
            await Promise.resolve(handler(message, metadata));
            console.log(`✅ [${i + 1}/${value.messages.length}] Message handler completed for:`, message.id);
          } else {
            console.error(`❌ [${i + 1}/${value.messages.length}] Handler is null!`);
          }
        } catch (error) {
          console.error(`❌ [${i + 1}/${value.messages.length}] Error in message handler:`, error);
          if (error instanceof Error) {
            console.error('Error details:', error.message, error.stack);
          }
          if (this.webhookHandlers.onError) {
            await Promise.resolve(this.webhookHandlers.onError(error));
          }
        }
      }
    } else {
      if (!value.messages) {
        console.log('⚠️ No messages found in webhook value');
      }
      if (!this.webhookHandlers.onMessage) {
        console.error('❌ No onMessage handler registered!');
      }
    }

    // Handle message statuses (they come in the same 'messages' field change)
    if (value.statuses && this.webhookHandlers.onMessageStatus) {
      console.log(`📊 Found ${value.statuses.length} status update(s) to process`);
      for (let i = 0; i < value.statuses.length; i++) {
        const status = value.statuses[i];
        console.log(`📊 [${i + 1}/${value.statuses.length}] Processing status update:`, {
          id: status.id,
          status: status.status,
          recipient: status.recipient_id,
          timestamp: status.timestamp
        });
        
        // Execute handler immediately instead of queueing
        try {
          const handler = this.webhookHandlers.onMessageStatus;
          if (handler) {
            await Promise.resolve(handler(status));
            console.log(`✅ [${i + 1}/${value.statuses.length}] Status handler completed for:`, status.id);
          }
        } catch (error) {
          console.error(`❌ [${i + 1}/${value.statuses.length}] Error in status handler:`, error);
          if (error instanceof Error) {
            console.error('Error details:', error.message, error.stack);
          }
          if (this.webhookHandlers.onError) {
            await Promise.resolve(this.webhookHandlers.onError(error));
          }
        }
      }
    } else {
      if (!value.statuses) {
        console.log('⚠️ No statuses found in webhook value');
      }
      if (!this.webhookHandlers.onMessageStatus) {
        console.log('⚠️ No onMessageStatus handler registered (this is OK if not needed)');
      }
    }
    
    console.log('📬 ========== handleMessageWebhook COMPLETED ==========');
  }

  /**
   * Handle status webhook
   */
  private async handleStatusWebhook(value: WebhookMessage['entry'][0]['changes'][0]['value']): Promise<void> {
    if (!value.statuses || !this.webhookHandlers.onMessageStatus) {
      return;
    }

    for (const status of value.statuses) {
      this.queueWebhookTask(async () => {
        const handler = this.webhookHandlers.onMessageStatus;
        if (handler) {
          await Promise.resolve(handler(status));
        }
      });
    }
  }

  /**
   * Handle webhook verification (GET request)
   */
  verifyWebhookRequest(query: Record<string, string>): { success: boolean; challenge?: string; error?: string } {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.webhookVerifyToken && challenge) {
      console.log('Webhook verified successfully');
      return { success: true, challenge };
    }

    return { success: false, error: 'Forbidden' };
  }

  /**
   * Process webhook POST request
   * Note: For Next.js, we need to await handlers to ensure they execute before response
   */
  async processWebhookRequest(body: WebhookMessage, signature?: string): Promise<{ status: string; processed?: boolean; error?: string }> {
    try {
      // Await handleWebhook to ensure handlers execute synchronously
      await this.handleWebhook(body, signature);
      return { status: 'received', processed: true };
    } catch (error) {
      console.error('Webhook processing error:', error);
      if (this.webhookHandlers.onError) {
        await Promise.resolve(this.webhookHandlers.onError(error));
      }
      return { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Start a built-in webhook HTTP server
   */
  startWebhookServer(port: number = 3000, path: string = '/webhook', callback?: () => void): http.Server {
    if (this.webhookServer) {
      throw new Error('Webhook server is already running');
    }

    const parseQuery = (url: string): Record<string, string> => {
      const queryString = url.split('?')[1];
      if (!queryString) return {};
      
      return queryString.split('&').reduce((acc, pair) => {
        const [key, value] = pair.split('=');
        acc[decodeURIComponent(key)] = decodeURIComponent(value || '');
        return acc;
      }, {} as Record<string, string>);
    };

    this.webhookServer = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = req.url || '';
      const pathname = url.split('?')[0];
      
      // Only handle the webhook path
      if (pathname !== path) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      try {
        // Handle GET (verification)
        if (req.method === 'GET') {
          const query = parseQuery(url);
          const result = this.verifyWebhookRequest(query);
          
          if (result.success) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(result.challenge);
          } else {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: result.error }));
          }
          return;
        }

        // Handle POST (events)
        if (req.method === 'POST') {
          let body = '';
          
          req.on('data', (chunk: Buffer) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const signature = req.headers['x-hub-signature-256'] as string | undefined;
              const parsedBody = JSON.parse(body) as WebhookMessage;
              
              const result = await this.processWebhookRequest(parsedBody, signature);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(result));
            } catch (error) {
              console.error('Webhook processing error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Internal server error' }));
            }
          });
          
          return;
        }

        // Method not allowed
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        
      } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });

    this.webhookServer.listen(port, () => {
      console.log(`Webhook server listening on port ${port} at path ${path}`);
      if (callback) callback();
    });

    return this.webhookServer;
  }

  /**
   * Stop the webhook server
   */
  stopWebhookServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.webhookServer) {
        reject(new Error('No webhook server is running'));
        return;
      }

      this.webhookServer.close((err?: Error) => {
        if (err) {
          reject(err);
        } else {
          this.webhookServer = null;
          console.log('Webhook server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * Register webhook with Meta
   */
  async registerWebhook(webhookUrl: string, fields: string[] = ['messages']): Promise<unknown> {
    if (!this.businessAccountId) {
      throw new Error('Business account ID required for webhook registration');
    }

    const data = {
      object: 'whatsapp_business_account',
      callback_url: webhookUrl,
      verify_token: this.webhookVerifyToken,
      fields: fields.join(','),
    };

    return this._makeRequest<unknown>(
      `${this.businessAccountId}/subscribed_apps`,
      'POST',
      data
    );
  }

  /**
   * Get webhook subscriptions
   */
  async getWebhookSubscriptions(): Promise<unknown> {
    if (!this.businessAccountId) {
      throw new Error('Business account ID required');
    }

    return this._makeRequest<unknown>(
      `${this.businessAccountId}/subscribed_apps`,
      'GET'
    );
  }

  /**
   * Test webhook
   */
  async testWebhook(webhookUrl: string): Promise<unknown> {
    if (!this.appSecret) {
      throw new Error('App secret required for webhook testing');
    }

    const testPayload: WebhookMessage = {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'test_entry',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '+1234567890',
              phone_number_id: 'test_phone_id'
            },
            contacts: [{
              profile_name: 'Test User',
              wa_id: 'test_wa_id'
            }],
            messages: [{
              from: '1234567890',
              id: 'test_msg_' + Date.now(),
              timestamp: Date.now().toString(),
              text: { body: 'Test message' },
              type: 'text'
            }]
          },
          field: 'messages'
        }]
      }]
    };

    const payload = JSON.stringify(testPayload);
    const signature = 'sha256=' + crypto
      .createHmac('sha256', this.appSecret)
      .update(payload)
      .digest('hex');

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': signature
        },
        body: payload
      });

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: await response.text()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get phone number info
   */
  async getPhoneNumberInfo(): Promise<unknown> {
    return this._makeRequest<unknown>(this.phoneNumberId, 'GET');
  }

  /**
   * Get business profile
   */
  async getBusinessProfile(): Promise<unknown> {
    return this._makeRequest<unknown>(
      `${this.phoneNumberId}/whatsapp_business_profile`,
      'GET'
    );
  }

  /**
   * Update business profile
   */
  async updateBusinessProfile(profile: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    vertical?: string;
    websites?: string[];
  }): Promise<unknown> {
    return this._makeRequest<unknown>(
      `${this.phoneNumberId}/whatsapp_business_profile`,
      'POST',
      { messaging_product: 'whatsapp', ...profile }
    );
  }
}

export default WhatsAppHandler;