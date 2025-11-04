/* eslint-disable @typescript-eslint/no-explicit-any */
import { OpenAI } from 'openai';

// ============================================
// TYPES
// ============================================

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Represents the JSON Schema for structured output.
 * See: https://json-schema.org/understanding-json-schema/
 */
type JsonSchema = Record<string, unknown>;

/**
 * Configuration for requesting a structured JSON output from the model.
 * See: https://openrouter.ai/docs/features/structured-outputs
 */
interface ResponseFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    strict: boolean;
    schema: JsonSchema;
  };
}

export interface BaseConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  debug?: boolean;
  // OpenRouter specific options
  baseURL?: string;
  defaultHeaders?: {
    'HTTP-Referer'?: string;
    'X-Title'?: string;
    [key: string]: string | undefined;
  };
  // Structured Output option
  responseFormat?: ResponseFormat;
  // Prompt Caching option
  cache?: boolean;
  // High-volume handling options
  maxConcurrentRequests?: number; // Max concurrent requests (default: 10)
  retryAttempts?: number; // Number of retry attempts (default: 3)
  retryDelay?: number; // Initial retry delay in ms (default: 1000)
  rateLimitRPM?: number; // Requests per minute limit (default: 60)
}

interface RequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ResponseFormat;
  cache?: boolean;
}

// ============================================
// MAIN AI MODEL CLASS
// ============================================

export class AIModel {
  private client: OpenAI;
  private messages: Message[] = [];
  private baseConfig: Required<Omit<BaseConfig, 'apiKey' | 'baseURL' | 'defaultHeaders' | 'responseFormat' | 'cache' | 'maxConcurrentRequests' | 'retryAttempts' | 'retryDelay' | 'rateLimitRPM'>>;
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private debug: boolean;
  private baseResponseFormat: ResponseFormat | undefined;
  private baseCache: boolean;
  
  // High-volume handling
  private maxConcurrentRequests: number;
  private retryAttempts: number;
  private retryDelay: number;
  private rateLimitRPM: number;
  private activeRequests: number = 0;
  private requestQueue: Array<() => Promise<any>> = [];
  private requestTimestamps: number[] = [];
  private isProcessingQueue: boolean = false;

  constructor(config: BaseConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required');
    }

    this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1';
    this.defaultHeaders = {
      'HTTP-Referer': config.defaultHeaders?.['HTTP-Referer'] || '',
      'X-Title': config.defaultHeaders?.['X-Title'] || 'AIModel App',
      ...Object.fromEntries(
        Object.entries(config.defaultHeaders || {}).filter(([key]) => 
          key !== 'HTTP-Referer' && key !== 'X-Title'
        )
      )
    };

    this.client = new OpenAI({ 
      apiKey: config.apiKey,
      baseURL: this.baseURL,
      defaultHeaders: this.defaultHeaders
    });
    
    this.baseConfig = {
      model: config.model || 'minimax/minimax-m2:free', // Updated default model
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens || 1000,
      systemPrompt: config.systemPrompt || '',
      debug: config.debug ?? false,
    };

    this.baseResponseFormat = config.responseFormat;
    this.baseCache = config.cache ?? false; // Default to false for prompt caching
    this.debug = this.baseConfig.debug;
    
    // High-volume handling config
    this.maxConcurrentRequests = config.maxConcurrentRequests ?? 10;
    this.retryAttempts = config.retryAttempts ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.rateLimitRPM = config.rateLimitRPM ?? 60;

    if (this.debug) {
      this.log('CONFIG', '🚀 AIModel initialized', {
        baseURL: this.baseURL,
        model: this.baseConfig.model,
        responseFormat: this.baseResponseFormat ? 'Enabled' : 'Disabled',
        cache: this.baseCache ? 'Enabled' : 'Disabled',
        maxConcurrentRequests: this.maxConcurrentRequests,
        retryAttempts: this.retryAttempts,
        rateLimitRPM: this.rateLimitRPM,
      });
    }
  }

  // ============================================
  // LOGGING & CONFIG
  // ============================================
  
  private log(type: string, message: string, data?: any): void {
    if (this.debug) {
      console.log(`[${type}] ${message}`, data ? data : '');
    }
  }

  enableDebug(enable: boolean = true): this {
    this.debug = enable;
    return this;
  }

  setSystemPrompt(prompt: string): this {
    this.baseConfig.systemPrompt = prompt;
    return this;
  }

  getSystemPrompt(): string {
    return this.baseConfig.systemPrompt;
  }

  setResponseFormat(format: ResponseFormat): this {
    this.baseResponseFormat = format;
    return this;
  }

  setCache(enabled: boolean): this {
    this.baseCache = enabled;
    return this;
  }

  updateConfig(config: Partial<Omit<BaseConfig, 'apiKey' | 'baseURL' | 'defaultHeaders'>>): this {
    if (config.model !== undefined) this.baseConfig.model = config.model;
    if (config.temperature !== undefined) this.baseConfig.temperature = config.temperature;
    if (config.maxTokens !== undefined) this.baseConfig.maxTokens = config.maxTokens;
    if (config.systemPrompt !== undefined) this.baseConfig.systemPrompt = config.systemPrompt;
    if (config.debug !== undefined) this.debug = config.debug;
    if (config.responseFormat !== undefined) this.baseResponseFormat = config.responseFormat;
    if (config.cache !== undefined) this.baseCache = config.cache;
    if (config.maxConcurrentRequests !== undefined) this.maxConcurrentRequests = config.maxConcurrentRequests;
    if (config.retryAttempts !== undefined) this.retryAttempts = config.retryAttempts;
    if (config.retryDelay !== undefined) this.retryDelay = config.retryDelay;
    if (config.rateLimitRPM !== undefined) this.rateLimitRPM = config.rateLimitRPM;
    return this;
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): { queueLength: number; activeRequests: number; maxConcurrent: number } {
    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.maxConcurrentRequests,
    };
  }

  /**
   * Clear request queue
   */
  clearQueue(): void {
    this.requestQueue = [];
    if (this.debug) {
      this.log('QUEUE', '🗑️ Request queue cleared');
    }
  }

  getConfig(): Required<Omit<BaseConfig, 'apiKey' | 'baseURL' | 'defaultHeaders' | 'responseFormat' | 'cache' | 'maxConcurrentRequests' | 'retryAttempts' | 'retryDelay' | 'rateLimitRPM'>> & { 
    responseFormat?: ResponseFormat;
    cache: boolean;
    maxConcurrentRequests: number;
    retryAttempts: number;
    retryDelay: number;
    rateLimitRPM: number;
  } { 
    return { 
      ...this.baseConfig, 
      responseFormat: this.baseResponseFormat,
      cache: this.baseCache,
      maxConcurrentRequests: this.maxConcurrentRequests,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      rateLimitRPM: this.rateLimitRPM,
    }; 
  }

  addMessage(content: string, role: 'user' | 'assistant' = 'user'): this {
    this.messages.push({ role, content });
    return this;
  }

  addUserMessage(content: string): this {
    return this.addMessage(content, 'user');
  }

  addAssistantMessage(content: string): this {
    return this.addMessage(content, 'assistant');
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  clearMessages(): this {
    this.messages = [];
    return this;
  }

  reset(): this {
    this.messages = [];
    return this;
  }

  private buildMessages(): Message[] {
    const messages: Message[] = [];
    
    if (this.baseConfig.systemPrompt) {
      messages.push({ role: 'system', content: this.baseConfig.systemPrompt });
    }
    
    messages.push(...this.messages);
    return messages;
  }

  private validateMessages(): void {
    if (this.messages.length === 0 && !this.baseConfig.systemPrompt) {
      throw new Error('No messages to send. Add messages or set a system prompt.');
    }
  }

  private mergeOptions(options?: RequestOptions) {
    return {
      model: options?.model || this.baseConfig.model,
      temperature: options?.temperature ?? this.baseConfig.temperature,
      maxTokens: options?.maxTokens ?? this.baseConfig.maxTokens,
      responseFormat: options?.responseFormat || this.baseResponseFormat,
      cache: options?.cache ?? this.baseCache,
    };
  }

  // ============================================
  // HIGH-VOLUME HANDLING METHODS
  // ============================================

  /**
   * Rate limiting: Check if we can make a request
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    
    // If we're at the limit, wait
    if (this.requestTimestamps.length >= this.rateLimitRPM) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestRequest) + 100; // Add 100ms buffer
      if (this.debug) {
        this.log('RATE_LIMIT', `⏳ Rate limit reached, waiting ${waitTime}ms`);
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.waitForRateLimit(); // Recursive check
    }
    
    // Record this request
    this.requestTimestamps.push(now);
  }

  /**
   * Concurrency control: Wait if too many concurrent requests
   */
  private async waitForConcurrency(): Promise<void> {
    while (this.activeRequests >= this.maxConcurrentRequests) {
      if (this.debug) {
        this.log('CONCURRENCY', `⏳ Waiting for available slot (${this.activeRequests}/${this.maxConcurrentRequests})`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.message?.includes('rate limit');
      const isServerError = error?.status >= 500 && error?.status < 600;
      
      if ((isRateLimit || isServerError) && attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        if (this.debug) {
          this.log('RETRY', `🔄 Retry attempt ${attempt}/${this.retryAttempts} after ${delay}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeWithRetry(fn, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      await this.waitForConcurrency();
      await this.waitForRateLimit();

      const requestFn = this.requestQueue.shift();
      if (requestFn) {
        this.activeRequests++;
        requestFn()
          .finally(() => {
            this.activeRequests--;
            // Process next in queue
            this.processQueue();
          })
          .catch(() => {
            // Error already handled in requestFn
          });
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Queue a request for execution
   */
  private async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  // ============================================
  // CORE API METHODS (FIXED)
  // ============================================

  /**
   * Sends a request to the AI model and returns a structured response.
   * The type of the `content` property is determined by the `responseFormat` option.
   * 
   * @param options - Optional request settings, including `responseFormat` for structured output and `cache` for prompt caching.
   * @returns A promise that resolves to an AIResponse object.
   */
  async send<T = string>(options?: RequestOptions): Promise<AIResponse<T>> {
    this.validateMessages();
    const messages = this.buildMessages();
    const config = this.mergeOptions(options);

    const requestBody: any = {
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };

    // Add structured output if specified
    if (config.responseFormat) {
      requestBody.response_format = config.responseFormat;
    }

    // Add prompt caching if specified (OpenRouter feature)
    if (config.cache) {
      requestBody.cache = true;
    }

    if (this.debug) {
      this.log('REQUEST', '📤 Sending request to OpenRouter', {
        model: config.model,
        responseFormat: config.responseFormat ? { name: config.responseFormat.json_schema.name } : 'None',
        cache: config.cache ? 'Enabled' : 'Disabled',
      });
    }

    try {
      // Execute with rate limiting, concurrency control, and retry logic
      const completion = await this.queueRequest(() =>
        this.executeWithRetry(() => this.client.chat.completions.create(requestBody))
      );
      const rawContent = completion.choices[0].message?.content || '';
      
      let parsedContent: T;
      if (config.responseFormat) {
        try {
          parsedContent = JSON.parse(rawContent) as T;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Failed to parse structured JSON response. Error: ${errorMessage}. Model returned: "${rawContent}"`);
        }
      } else {
        // If no format, T is expected to be string
        parsedContent = rawContent as T;
      }
      
      this.messages.push({ role: 'assistant', content: rawContent });

      const response: AIResponse<T> = {
        content: parsedContent,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
        model: completion.model,
      };

      if (this.debug) {
        this.log('RESPONSE', '📥 Received response', {
          model: response.model,
          usage: response.usage,
          contentType: config.responseFormat ? 'JSON Object' : 'String',
        });
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.debug) this.log('ERROR', '❌ API Error', { message: errorMessage });
      throw new Error(`AI API Error: ${errorMessage}`);
    }
  }

  /**
   * Sends a streaming request to the AI model.
   * The final return type is determined by the `responseFormat` option.
   * 
   * @param onChunk - Callback function to handle each chunk of the stream.
   * @param options - Optional request settings, including `responseFormat` and `cache`.
   * @returns A promise that resolves to the final complete content (string or parsed object).
   */
  async stream<T = string>(
    onChunk: (chunk: string) => void,
    options?: RequestOptions
  ): Promise<T> {
    this.validateMessages();
    const messages = this.buildMessages();
    const config = this.mergeOptions(options);

    const requestBody: any = {
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
    };

    if (config.responseFormat) {
      requestBody.response_format = config.responseFormat;
    }

    // Add prompt caching if specified (OpenRouter feature)
    if (config.cache) {
      requestBody.cache = true;
    }

    if (this.debug) {
      this.log('REQUEST', '📤 Starting streaming request', {
        model: config.model,
        responseFormat: config.responseFormat ? { name: config.responseFormat.json_schema.name } : 'None',
        cache: config.cache ? 'Enabled' : 'Disabled',
      });
    }

    try {
      // Execute with rate limiting, concurrency control, and retry logic
      const streamResponse = await this.queueRequest(() =>
        this.executeWithRetry(() => this.client.chat.completions.create(requestBody))
      );
      
      // Check if the response is a stream and handle accordingly
      if (!(streamResponse as any)[Symbol.asyncIterator]) {
        throw new Error('Stream response is not async iterable');
      }

      const stream = streamResponse as unknown as AsyncIterable<any>;
      let fullContent = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullContent += content;
          onChunk(content);
        }
      }

      let parsedContent: T;
      if (config.responseFormat) {
        try {
          parsedContent = JSON.parse(fullContent) as T;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Failed to parse streamed JSON response. Error: ${errorMessage}. Model returned: "${fullContent}"`);
        }
      } else {
        parsedContent = fullContent as T;
      }
      
      this.messages.push({ role: 'assistant', content: fullContent });

      if (this.debug) {
        this.log('STREAM', '✅ Streaming completed', {
          totalLength: fullContent.length,
          contentType: config.responseFormat ? 'JSON Object' : 'String',
        });
      }

      return parsedContent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (this.debug) this.log('ERROR', '❌ Streaming Error', { message: errorMessage });
      throw new Error(`AI Stream Error: ${errorMessage}`);
    }
  }

  // ============================================
  // STATIC UTILITY METHODS
  // ============================================

  static async quickChat<T = string>(
    config: BaseConfig,
    prompt: string,
    options?: RequestOptions
  ): Promise<T> {
    const ai = new AIModel(config);
    const response = await ai.addUserMessage(prompt).send<T>(options);
    return response.content;
  }

  static createFromEnv(overrides?: Partial<BaseConfig>): AIModel {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY or OPENAI_API_KEY environment variable is not set');
    }
    return new AIModel({ 
      apiKey, 
      baseURL: 'https://openrouter.ai/api/v1',
      model: 'minimax/minimax-m2:free', // Set as default
      ...overrides 
    });
  }
}

// ============================================
// UPDATED TYPES FOR RESPONSE
// ============================================

interface AIResponse<T = string> {
  content: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}

// ============================================
// USAGE EXAMPLES
// ============================================

// Example 11: Unified `send` method for Text and Structured Data
export async function example11_unified_send() {
  // Define a structured data type
  interface CalendarEvent {
    title: string;
    date: string; // ISO 8601 date string
    duration_hours: number;
  }

  const eventSchema: JsonSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      date: { type: "string", format: "date-time" },
      duration_hours: { type: "number" },
    },
    required: ["title", "date", "duration_hours"],
    additionalProperties: false,
  };

  const ai = AIModel.createFromEnv({ debug: true });

  // --- Case 1: Get a plain text response ---
  // TypeScript infers `response.content` as a `string`
  const textResponse = await ai
    .addUserMessage("What is the capital of France?")
    .send(); // No options, so it returns a string

  console.log('\n=== Text Response ===');
  console.log(`The answer is: ${textResponse.content.toUpperCase()}`); // String methods are available

  ai.clearMessages();

  // --- Case 2: Get a structured JSON response ---
  // TypeScript infers `response.content` as `CalendarEvent`
  const structuredResponse = await ai
    .addUserMessage("Extract the event details from this sentence: 'My meeting with Bob is on 2024-10-26T10:00:00Z and will last for 2 hours.'")
    .send<CalendarEvent>({
      model: 'minimax/minimax-m2:free', // Use the default model
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'calendar_event', strict: true, schema: eventSchema },
      },
      cache: true, // Enable prompt caching for this request
    });

  console.log('\n=== Structured Response ===');
  console.log(`Event Title: ${structuredResponse.content.title}`); // Autocomplete for `title` works!
  console.log(`Event Date: ${structuredResponse.content.date}`); // ISO string
  console.log(`Duration: ${structuredResponse.content.duration_hours} hours`);
}

// Example 12: Unified `stream` method
export async function example12_unified_stream() {
  interface Recipe {
    name: string;
    ingredients: string[];
    steps: string[];
  }

  const recipeSchema: JsonSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      ingredients: { type: "array", items: { type: "string" } },
      steps: { type: "array", items: { type: "string" } },
    },
    required: ["name", "ingredients", "steps"],
    additionalProperties: false,
  };

  const ai = AIModel.createFromEnv({ debug: true, cache: true }); // Enable caching globally

  // --- Case 1: Stream plain text ---
  console.log('\n=== Streaming Text ===');
  const streamedText = await ai
    .addUserMessage("Write a short story about a robot discovering music.")
    .stream((chunk) => process.stdout.write(chunk)); // Returns a string

  console.log('\n\n--- Full Streamed Text ---');
  console.log(streamedText.substring(0, 100) + '...');

  ai.clearMessages();

  // --- Case 2: Stream and parse structured JSON ---
  console.log('\n=== Streaming Structured Data ===');
  console.log('Streaming recipe data...');
  
  const streamedRecipe = await ai
    .addUserMessage("Give me a simple recipe for scrambled eggs.")
    .stream<Recipe>((chunk) => process.stdout.write(chunk), {
      model: 'minimax/minimax-m2:free',
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: 'recipe', strict: true, schema: recipeSchema },
      },
      cache: true, // Enable caching for this specific request
    }); // Returns a `Recipe` object

  console.log('\n\n--- Parsed Recipe Object ---');
  console.log(`Recipe: ${streamedRecipe.name}`);
  console.log(`First ingredient: ${streamedRecipe.ingredients[0]}`);
  console.log(`First step: ${streamedRecipe.steps[0]}`);
}

// Example 13: High-volume handling
export async function example13_high_volume() {
  // Configure for high-volume usage
  const ai = AIModel.createFromEnv({
    debug: true,
    maxConcurrentRequests: 20, // Allow 20 concurrent requests
    retryAttempts: 5, // Retry up to 5 times
    retryDelay: 500, // Start with 500ms delay
    rateLimitRPM: 120, // Allow 120 requests per minute
  });

  // Make many requests in parallel - they'll be queued and rate-limited automatically
  const promises = Array.from({ length: 50 }, (_, i) =>
    ai
      .clearMessages()
      .addUserMessage(`Question ${i + 1}: What is ${i + 1} + ${i + 1}?`)
      .send()
  );

  // Check queue status
  console.log('Queue status:', ai.getQueueStatus());

  // Execute all requests (automatically handled with rate limiting and retries)
  const results = await Promise.all(promises);
  
  console.log(`\n✅ Completed ${results.length} requests`);
  console.log('Final queue status:', ai.getQueueStatus());
}