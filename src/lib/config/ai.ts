import { AIModel, type BaseConfig } from "../libs/ai";

/**
 * AI Configuration
 * Simple configuration helper for AI model initialization
 */

// Built-in prompt templates
export const PROMPTS = {
  ASSISTANT: "You are a helpful AI assistant.",
  CODE_ASSISTANT: "You are an expert programming assistant.",
  WRITER: "You are a creative writing assistant.",
} as const;

// Custom prompts registry
const customPrompts: Record<string, string> = {};

// Add custom prompt
export function addCustomPrompt(name: string, prompt: string): void {
  customPrompts[name] = prompt;
}

// Get custom prompt
export function getCustomPrompt(name: string): string | undefined {
  return customPrompts[name];
}

// Get all custom prompts
export function getAllCustomPrompts(): Record<string, string> {
  return { ...customPrompts };
}

// Remove custom prompt
export function removeCustomPrompt(name: string): void {
  delete customPrompts[name];
}

// Clear all custom prompts
export function clearCustomPrompts(): void {
  Object.keys(customPrompts).forEach((key) => delete customPrompts[key]);
}

// Get config from environment variables
export function getAIConfig(): BaseConfig {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY is required");
  }

  return {
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    model: process.env.AI_MODEL || "minimax/minimax-m2:free",
    temperature: process.env.AI_TEMPERATURE
      ? parseFloat(process.env.AI_TEMPERATURE)
      : 0.7,
    maxTokens: process.env.AI_MAX_TOKENS
      ? parseInt(process.env.AI_MAX_TOKENS, 10)
      : 1000,
    systemPrompt: process.env.AI_SYSTEM_PROMPT || PROMPTS.ASSISTANT,
    debug: process.env.AI_DEBUG === "true",
    cache: process.env.AI_CACHE === "true",
  };
}

// Create AI model instance
export function createAI(overrides?: Partial<BaseConfig>): AIModel {
  return new AIModel({ ...getAIConfig(), ...overrides });
}

// Resolve prompt (built-in, custom, or direct string)
function resolvePrompt(prompt: keyof typeof PROMPTS | string): string {
  // Check built-in prompts
  if (prompt in PROMPTS) {
    return PROMPTS[prompt as keyof typeof PROMPTS];
  }
  // Check custom prompts
  if (prompt in customPrompts) {
    return customPrompts[prompt];
  }
  // Return as-is (direct prompt string)
  return prompt;
}

// Create AI with prompt template
export function createAIWithPrompt(
  prompt: keyof typeof PROMPTS | string,
  overrides?: Partial<BaseConfig>
): AIModel {
  const systemPrompt = resolvePrompt(prompt);
  return createAI({ ...overrides, systemPrompt });
}

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example 1: Basic usage with default config
 *
 * const ai = createAI();
 * const response = await ai.addUserMessage('Hello').send();
 * console.log(response.content);
 */

/**
 * Example 2: Use a prompt template
 *
 * const ai = createAIWithPrompt('CODE_ASSISTANT');
 * const response = await ai.addUserMessage('Write a function to reverse a string').send();
 * console.log(response.content);
 */

/**
 * Example 3: Custom prompt
 *
 * const ai = createAIWithPrompt('You are a helpful math tutor.');
 * const response = await ai.addUserMessage('Explain calculus').send();
 * console.log(response.content);
 */

/**
 * Example 4: Override settings
 *
 * const ai = createAI({
 *   model: 'gpt-4',
 *   temperature: 0.5,
 *   maxTokens: 2000,
 * });
 * const response = await ai.addUserMessage('Write a story').send();
 * console.log(response.content);
 */

/**
 * Example 5: Streaming response
 *
 * const ai = createAIWithPrompt('WRITER');
 * await ai
 *   .addUserMessage('Write a short story')
 *   .stream((chunk) => process.stdout.write(chunk));
 */

/**
 * Example 6: Add and use custom prompt
 *
 * // Register custom prompt
 * addCustomPrompt('MATH_TUTOR', 'You are a patient math tutor who explains concepts clearly.');
 *
 * // Use custom prompt
 * const ai = createAIWithPrompt('MATH_TUTOR');
 * const response = await ai.addUserMessage('Explain algebra').send();
 * console.log(response.content);
 */

/**
 * Example 7: Multiple custom prompts
 *
 * addCustomPrompt('TRANSLATOR', 'You are a professional translator.');
 * addCustomPrompt('SUMMARIZER', 'You summarize content concisely.');
 *
 * const translator = createAIWithPrompt('TRANSLATOR');
 * const summarizer = createAIWithPrompt('SUMMARIZER');
 */

export const aiModel = createAIWithPrompt(" you are a helpful assistant");
