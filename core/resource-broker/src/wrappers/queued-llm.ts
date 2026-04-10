/**
 * @module @kb-labs/core-resource-broker/wrappers/queued-llm
 * QueuedLLM - ILLM wrapper that routes requests through ResourceBroker.
 */

import type {
  ILLM,
  LLMOptions,
  LLMResponse,
  LLMMessage,
  LLMToolCallOptions,
  LLMToolCallResponse,
  LLMProtocolCapabilities,
} from '@kb-labs/core-platform';
import type { IResourceBroker, ResourcePriority } from '../types.js';
import { estimateTokens } from '../rate-limit/presets.js';

/**
 * Extended LLM options with priority.
 */
export interface QueuedLLMOptions extends LLMOptions {
  /** Request priority (default: 'normal') */
  priority?: ResourcePriority;
}

/**
 * ILLM wrapper that routes requests through ResourceBroker.
 *
 * Features:
 * - Transparent integration (implements ILLM interface)
 * - Automatic token estimation for rate limiting
 * - Priority support for different use cases
 * - Retry and rate limiting handled by broker
 *
 * Note: stream() bypasses the queue for real-time UX.
 *
 * @example
 * ```typescript
 * const queuedLLM = new QueuedLLM(broker, realLLM);
 *
 * // Normal request (goes through queue)
 * const response = await queuedLLM.complete(prompt);
 *
 * // High priority request
 * const response = await queuedLLM.complete(prompt, { priority: 'high' });
 *
 * // Stream (bypasses queue for real-time)
 * for await (const chunk of queuedLLM.stream(prompt)) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export class QueuedLLM implements ILLM {
  constructor(
    private broker: IResourceBroker,
    private realLLM: ILLM
  ) {}

  /**
   * Generate a completion through the queue.
   *
   * @param prompt - Text prompt
   * @param options - Optional generation options with priority
   * @returns LLM response
   * @throws Error if request fails after all retries
   */
  async complete(prompt: string, options?: QueuedLLMOptions): Promise<LLMResponse> {
    const priority: ResourcePriority = options?.priority ?? 'normal';
    const estimatedTokens = estimateTokens(prompt);

    // Use resource from metadata if provided (set by LLMRouter), fallback to 'llm'
    const resource = options?.metadata?.resource ?? 'llm';

    const response = await this.broker.enqueue<LLMResponse>({
      resource,
      operation: 'complete',
      args: [prompt, options],
      priority,
      estimatedTokens,
    });

    if (!response.success) {
      throw response.error ?? new Error('LLM request failed');
    }

    return response.data!;
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

  /**
   * Stream a completion (bypasses queue for real-time UX).
   *
   * Streaming is passed through directly to the underlying LLM
   * because:
   * 1. Real-time user experience requires immediate response
   * 2. Token counting happens after streaming completes
   * 3. Rate limits are still enforced by the underlying adapter
   *
   * @param prompt - Text prompt
   * @param options - Optional generation options
   * @returns Async iterable of text chunks
   */
  stream(prompt: string, options?: LLMOptions): AsyncIterable<string> {
    // Pass through to real LLM for real-time streaming
    return this.realLLM.stream(prompt, options);
  }

  /**
   * Chat with native tool calling support (proxies to underlying LLM).
   * Currently NOT queued - passes through directly for simplicity.
   * TODO: Add queueing support when needed.
   */
  async chatWithTools(
    messages: LLMMessage[],
    options: LLMToolCallOptions
  ): Promise<LLMToolCallResponse> {
    // Check if underlying LLM supports chatWithTools
    if (!this.realLLM.chatWithTools) {
      throw new Error('Underlying LLM does not support chatWithTools');
    }

    // TODO: Route through queue for rate limiting
    // For now, pass through directly to avoid complexity
    return this.realLLM.chatWithTools(messages, options);
  }
}

/**
 * Create a QueuedLLM wrapper.
 *
 * @param broker - ResourceBroker instance
 * @param llm - Real ILLM implementation
 * @returns Wrapped ILLM that routes through broker
 */
export function createQueuedLLM(broker: IResourceBroker, llm: ILLM): QueuedLLM {
  return new QueuedLLM(broker, llm);
}
