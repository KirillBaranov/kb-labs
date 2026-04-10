import type { LLMOptions, LLMResponse, LLMToolCallResponse } from '../types.js';

/**
 * Typed LLM proxy — wraps Platform API calls with LLM-specific types.
 */
export class LLMProxy {
  constructor(private readonly call: <T>(adapter: string, method: string, ...args: unknown[]) => Promise<T>) {}

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    return this.call<LLMResponse>('llm', 'complete', prompt, options);
  }

  async chatWithTools(messages: unknown[], options: unknown): Promise<LLMToolCallResponse> {
    return this.call<LLMToolCallResponse>('llm', 'chatWithTools', messages, options);
  }
}
