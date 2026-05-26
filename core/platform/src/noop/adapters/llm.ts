/**
 * @module @kb-labs/core-platform/noop/adapters/llm
 *
 * NoOp `ILLM` — every functional call throws `AdapterUnavailableError`.
 *
 * Selected as the default fallback for the `llm` slot because no honest
 * in-process fake exists: any deterministic-but-fake response would lie
 * to the caller about model behaviour. Throwing forces operators to wire
 * up a real provider.
 *
 * Test doubles with programmable responses live in
 * `@kb-labs/shared-testing-platform/mocks` (MockLLM).
 */

import { AdapterUnavailableError } from '../../errors.js';
import type {
  ILLM,
  LLMMessage,
  LLMOptions,
  LLMProtocolCapabilities,
  LLMResponse,
  LLMToolCallOptions,
  LLMToolCallResponse,
} from '../../adapters/llm.js';

const SLOT = 'llm';

export class NoOpLLM implements ILLM {
  async complete(_prompt: string, _options?: LLMOptions): Promise<LLMResponse> {
    throw new AdapterUnavailableError(SLOT);
  }

  stream(_prompt: string, _options?: LLMOptions): AsyncIterable<string> {
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            throw new AdapterUnavailableError(SLOT);
          },
        };
      },
    };
  }

  async chatWithTools(
    _messages: LLMMessage[],
    _options: LLMToolCallOptions,
  ): Promise<LLMToolCallResponse> {
    throw new AdapterUnavailableError(SLOT);
  }
}

/**
 * @deprecated Use `MockLLM` from `@kb-labs/shared-testing-platform/mocks`
 *   for tests, or configure a real adapter for production. Kept here
 *   temporarily until consumers migrate; this re-export will be removed.
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

  async *stream(prompt: string, _options?: LLMOptions): AsyncIterable<string> {
    const response = `[Mock LLM Stream] Received prompt of ${prompt.length} characters.`;
    for (const word of response.split(' ')) {
      yield word + ' ';
      await new Promise((r) => { setTimeout(r, 50); });
    }
  }
}
