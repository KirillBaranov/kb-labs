/**
 * @module @kb-labs/core-resource-broker/types
 * Type definitions for the Resource Broker system.
 *
 * The Resource Broker provides centralized queue management, rate limiting,
 * and retry logic for heavy platform resources (LLM, Embeddings, VectorStore).
 */

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rate limiting configuration for a resource.
 * Supports multiple rate limiting strategies (TPM, RPM, RPS, concurrent).
 */
export interface RateLimitConfig {
  /**
   * Tokens per minute limit (e.g., OpenAI TPM)
   * If undefined, no token-based rate limiting is applied
   */
  tokensPerMinute?: number;

  /**
   * Requests per minute limit (e.g., OpenAI RPM)
   * If undefined, no request-per-minute rate limiting is applied
   */
  requestsPerMinute?: number;

  /**
   * Requests per second limit
   * Some APIs (like Sber) use RPS instead of RPM
   */
  requestsPerSecond?: number;

  /**
   * Maximum tokens per single request
   * Provider-specific limit
   */
  maxTokensPerRequest?: number;

  /**
   * Maximum concurrent requests
   * For local models - GPU/CPU concurrency limit
   */
  maxConcurrentRequests?: number;

  /**
   * Safety margin (0-1, default 0.9)
   * Use only X% of the limit to avoid hitting exact boundaries
   */
  safetyMargin?: number;
}

/**
 * Result of attempting to acquire rate limit capacity.
 */
export interface AcquireResult {
  /** Whether the request is allowed to proceed */
  allowed: boolean;

  /** Milliseconds to wait if not allowed */
  waitTimeMs?: number;

  /** Remaining tokens in current window */
  tokensRemaining?: number;

  /** Remaining requests in current window */
  requestsRemaining?: number;

  /** Current active concurrent requests */
  activeRequests?: number;
}

/**
 * Statistics for a rate-limited resource.
 */
export interface RateLimitStats {
  /** Resource identifier */
  resource: string;

  /** Tokens used in current minute window */
  tokensThisMinute: number;

  /** Requests made in current minute window */
  requestsThisMinute: number;

  /** Requests made in current second window */
  requestsThisSecond: number;

  /** Currently active requests */
  activeRequests: number;

  /** Total requests made since start */
  totalRequests: number;

  /** Total tokens used since start */
  totalTokens: number;

  /** Number of times capacity was unavailable */
  waitCount: number;

  /** Total time spent waiting (ms) */
  totalWaitTime: number;
}

/**
 * Backend abstraction for rate limit state storage.
 * Allows swapping between in-memory and distributed storage.
 */
export interface RateLimitBackend {
  /**
   * Atomically check limit and reserve capacity.
   *
   * @param resource - Resource identifier (e.g., 'llm', 'embeddings')
   * @param tokens - Estimated tokens for this request
   * @param config - Rate limit configuration
   * @returns Acquire result with allowed/waitTime
   */
  acquire(
    resource: string,
    tokens: number,
    config: RateLimitConfig
  ): Promise<AcquireResult>;

  /**
   * Release a concurrent request slot.
   *
   * @param resource - Resource identifier
   */
  release(resource: string): Promise<void>;

  /**
   * Get current statistics for a resource.
   *
   * @param resource - Resource identifier
   */
  getStats(resource: string): Promise<RateLimitStats>;

  /**
   * Reset statistics for a resource.
   *
   * @param resource - Resource identifier
   */
  reset(resource: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUEUE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Priority levels for resource requests.
 * - high: User-facing operations (commit, interactive queries)
 * - normal: Background operations with reasonable latency expectations
 * - low: Analytics, batch processing, non-urgent tasks
 */
export type ResourcePriority = 'high' | 'normal' | 'low';

/**
 * Request to execute a resource operation.
 */
export interface ResourceRequest {
  /** Unique request identifier */
  id: string;

  /** Resource type ('llm', 'embeddings', 'vectorStore') */
  resource: string;

  /** Operation name ('complete', 'embed', 'search') */
  operation: string;

  /** Arguments to pass to the operation */
  args: unknown[];

  /** Request priority */
  priority: ResourcePriority;

  /** Estimated tokens for rate limiting (optional) */
  estimatedTokens?: number;

  /** Request timeout in ms (optional, default: 60000) */
  timeout?: number;

  /** Max retry attempts (optional, default: 3) */
  maxRetries?: number;

  /** Timestamp when request was created */
  createdAt: number;
}

/**
 * Response from a resource operation.
 */
export interface ResourceResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean;

  /** Result data if successful */
  data?: T;

  /** Error if failed */
  error?: Error;

  /** Number of retry attempts made */
  retries: number;

  /** Time spent waiting in queue (ms) */
  waitTime: number;

  /** Time spent executing the operation (ms) */
  processingTime: number;

  /** Total time from request to response (ms) */
  totalTime: number;
}

/**
 * Queue item wrapping a request with execution context.
 */
export interface QueueItem {
  /** The resource request */
  request: ResourceRequest;

  /** Resolve function to complete the promise */
  resolve: (response: ResourceResponse) => void;

  /** Reject function to fail the promise */
  reject: (error: Error) => void;

  /** Timestamp when added to queue */
  enqueuedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE BROKER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for a registered resource.
 */
export interface ResourceConfig {
  /** Rate limit configuration or preset name */
  rateLimits?: RateLimitConfig | string;

  /** Maximum retry attempts */
  maxRetries?: number;

  /** Base delay for exponential backoff (ms) */
  baseDelay?: number;

  /** Maximum delay between retries (ms) */
  maxDelay?: number;

  /** Request timeout (ms) */
  timeout?: number;

  /** The actual executor function */
  executor: ResourceExecutor;
}

/**
 * Function that executes a resource operation.
 */
export type ResourceExecutor = (
  operation: string,
  args: unknown[]
) => Promise<unknown>;

/**
 * Statistics for the resource broker.
 */
export interface ResourceBrokerStats {
  /** Stats per resource */
  resources: Record<string, ResourceStats>;

  /** Total requests processed */
  totalRequests: number;

  /** Total successful requests */
  totalSuccess: number;

  /** Total failed requests */
  totalErrors: number;

  /** Current queue size */
  queueSize: number;

  /** Uptime in milliseconds */
  uptime: number;
}

/**
 * Statistics for a single resource.
 */
export interface ResourceStats {
  /** Rate limit stats */
  rateLimits: RateLimitStats;

  /** Queue size for this resource */
  queueSize: number;

  /** Requests by priority */
  queueByPriority: {
    high: number;
    normal: number;
    low: number;
  };

  /** Total requests processed */
  totalRequests: number;

  /** Total successful requests */
  totalSuccess: number;

  /** Total failed requests */
  totalErrors: number;

  /** Average wait time (ms) */
  avgWaitTime: number;

  /** Average processing time (ms) */
  avgProcessingTime: number;
}

/**
 * Main resource broker interface.
 * Coordinates queues, rate limiting, and execution for all resources.
 */
export interface IResourceBroker {
  /**
   * Register a resource with its configuration.
   *
   * @param resource - Resource identifier
   * @param config - Resource configuration
   */
  register(resource: string, config: ResourceConfig): void;

  /**
   * Enqueue a request for execution.
   * Returns a promise that resolves when the request completes.
   *
   * @param request - Resource request (without id and createdAt)
   * @returns Response with result or error
   */
  enqueue<T>(
    request: Omit<ResourceRequest, 'id' | 'createdAt'>
  ): Promise<ResourceResponse<T>>;

  /**
   * Get broker statistics.
   */
  getStats(): ResourceBrokerStats;

  /**
   * Graceful shutdown - drain queues and stop processing.
   */
  shutdown(): Promise<void>;

  /**
   * Check if broker is shutting down.
   */
  isShuttingDown(): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// RETRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error classification for retry logic.
 */
export type ErrorType =
  | 'rate_limit' // 429 - should retry with backoff
  | 'server_error' // 5xx - should retry
  | 'timeout' // Request timeout - may retry
  | 'client_error' // 4xx (except 429) - should not retry
  | 'network' // Network error - may retry
  | 'unknown'; // Unknown - may retry once

/**
 * Configuration for retry strategy.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;

  /** Base delay in ms (default: 1000) */
  baseDelay: number;

  /** Maximum delay in ms (default: 30000) */
  maxDelay: number;

  /** Jitter factor (0-1, default: 0.1) */
  jitter: number;

  /** Which error types to retry */
  retryableErrors: ErrorType[];
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: 0.1,
  retryableErrors: ['rate_limit', 'server_error', 'timeout', 'network'],
};

/**
 * Default rate limit config (no limits).
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  safetyMargin: 0.9,
};
