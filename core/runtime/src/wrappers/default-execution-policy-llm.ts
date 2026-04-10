/**
 * @module @kb-labs/core-runtime/wrappers/default-execution-policy-llm
 * Centralized execution defaults wrapper for ILLM.
 */

import type {
  ILLM,
  LLMOptions,
  LLMResponse,
  LLMMessage,
  LLMToolCallOptions,
  LLMToolCallResponse,
  LLMExecutionPolicy,
  LLMProtocolCapabilities,
} from '@kb-labs/core-platform';

function mergeExecutionPolicy(
  defaults: LLMExecutionPolicy,
  local?: LLMExecutionPolicy
): LLMExecutionPolicy {
  if (!local) {
    return defaults;
  }

  return {
    ...defaults,
    ...local,
    cache: { ...defaults.cache, ...local.cache },
    stream: { ...defaults.stream, ...local.stream },
  };
}

function withExecutionDefaults(
  options: LLMOptions | undefined,
  defaults: LLMExecutionPolicy
): LLMOptions {
  return {
    ...(options ?? {}),
    execution: mergeExecutionPolicy(defaults, options?.execution),
  };
}

export class DefaultExecutionPolicyLLM implements ILLM {
  constructor(
    private readonly realLLM: ILLM,
    private readonly defaults: LLMExecutionPolicy
  ) {}

  async complete(prompt: string, options?: LLMOptions): Promise<LLMResponse> {
    return this.realLLM.complete(prompt, withExecutionDefaults(options, this.defaults));
  }

  stream(prompt: string, options?: LLMOptions): AsyncIterable<string> {
    return this.realLLM.stream(prompt, withExecutionDefaults(options, this.defaults));
  }

  async getProtocolCapabilities(): Promise<LLMProtocolCapabilities> {
    if (!this.realLLM.getProtocolCapabilities) {
      return {
        cache: { supported: false },
        stream: { supported: true },
      };
    }
    return this.realLLM.getProtocolCapabilities();
  }

  async chatWithTools(
    messages: LLMMessage[],
    options: LLMToolCallOptions
  ): Promise<LLMToolCallResponse> {
    if (!this.realLLM.chatWithTools) {
      throw new Error('Underlying LLM does not support chatWithTools');
    }
    return this.realLLM.chatWithTools(
      messages,
      withExecutionDefaults(options, this.defaults) as LLMToolCallOptions
    );
  }
}

export function createDefaultExecutionPolicyLLM(
  llm: ILLM,
  defaults?: LLMExecutionPolicy
): ILLM {
  if (!defaults || Object.keys(defaults).length === 0) {
    return llm;
  }

  return new DefaultExecutionPolicyLLM(llm, defaults);
}

