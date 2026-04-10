/**
 * @module @kb-labs/core-platform/noop/adapters/llm
 * Mock LLM implementation.
 */

import type {
  ILLM,
  LLMOptions,
  LLMResponse,
  LLMProtocolCapabilities,
} from '../../adapters/llm.js';

/**
 * Mock LLM that returns placeholder responses.
 * Useful for testing without API calls.
 */
export class MockLLM implements ILLM {
  getProtocolCapabilities(): LLMProtocolCapabilities {
    return {
      cache: { supported: false },
      stream: { supported: true },
    };
  }

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    const content = `[Mock LLM Response] Received prompt of ${prompt.length} characters.`;

    return {
      content,
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil(content.length / 4),
      },
      model: options?.model ?? 'mock-model',
    };
  }

  async *stream(prompt: string, options?: LLMOptions): AsyncIterable<string> {
    const response = `[Mock LLM Stream] Received prompt of ${prompt.length} characters.`;
    const words = response.split(' ');

    for (const word of words) {
      yield word + ' ';
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
  }
}
