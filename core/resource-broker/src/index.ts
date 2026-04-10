/**
 * @module @kb-labs/core-resource-broker
 * Centralized queue management, rate limiting, and retry logic for heavy platform resources.
 *
 * Features:
 * - Priority queue (high/normal/low) for request ordering
 * - Rate limiting with configurable backend (in-memory or distributed)
 * - Automatic retry with exponential backoff for 429 and 5xx errors
 * - Graceful shutdown with queue draining
 * - Per-resource statistics and monitoring
 * - Transparent adapter wrappers (QueuedLLM, QueuedEmbeddings, QueuedVectorStore)
 *
 * Architecture:
 * - Single process: InMemoryRateLimitBackend
 * - Distributed: StateBrokerRateLimitBackend (uses existing StateBroker HTTP daemon)
 *
 * @example
 * ```typescript
 * import {
 *   ResourceBroker,
 *   InMemoryRateLimitBackend,
 *   createQueuedLLM,
 * } from '@kb-labs/core-resource-broker';
 *
 * // Create broker
 * const backend = new InMemoryRateLimitBackend();
 * const broker = new ResourceBroker(backend);
 *
 * // Register LLM resource
 * broker.register('llm', {
 *   rateLimits: 'openai-tier-2',
 *   executor: (op, args) => llmAdapter[op](...args),
 * });
 *
 * // Create wrapped LLM
 * const queuedLLM = createQueuedLLM(broker, llmAdapter);
 *
 * // Use like normal ILLM
 * const response = await queuedLLM.complete(prompt);
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  // Rate limiting
  RateLimitConfig,
  AcquireResult,
  RateLimitStats,
  RateLimitBackend,
  // Queue
  ResourcePriority,
  ResourceRequest,
  ResourceResponse,
  QueueItem,
  // Broker
  ResourceConfig,
  ResourceExecutor,
  ResourceBrokerStats,
  ResourceStats,
  IResourceBroker,
  // Retry
  ErrorType,
  RetryConfig,
} from './types.js';

export { DEFAULT_RETRY_CONFIG, DEFAULT_RATE_LIMIT_CONFIG } from './types.js';

// Broker
export { ResourceBroker } from './broker/index.js';

// Queue
export { PriorityQueue } from './queue/index.js';

// Rate limiting
export {
  InMemoryRateLimitBackend,
  StateBrokerRateLimitBackend,
  RATE_LIMIT_PRESETS,
  getRateLimitConfig,
  estimateTokens,
  estimateBatchTokens,
  type RateLimitPreset,
} from './rate-limit/index.js';

// Retry
export {
  classifyError,
  isRateLimitError,
  isRetryableError,
  extractRetryAfter,
  shouldRetry,
  withRetry,
  calculateBackoffDelay,
  sleep,
  createRateLimitRetryConfig,
  createQuickRetryConfig,
  type RetryDecision,
} from './retry/index.js';

// Wrappers
export {
  QueuedLLM,
  createQueuedLLM,
  QueuedEmbeddings,
  createQueuedEmbeddings,
  QueuedVectorStore,
  createQueuedVectorStore,
  type QueuedLLMOptions,
  type QueuedEmbeddingsOptions,
  type QueuedVectorStoreOptions,
} from './wrappers/index.js';
