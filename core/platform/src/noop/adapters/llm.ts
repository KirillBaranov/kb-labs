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
 * Programmable test doubles live in `@kb-labs/shared-testing` (mockLLM).
 */

import { AdapterUnavailableError } from '../../errors.js';
import type {
  ILLM,
  LLMMessage,
  LLMOptions,
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
