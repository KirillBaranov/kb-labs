/**
 * @module @kb-labs/core-resource-broker/broker/resource-broker
 * Main ResourceBroker implementation - coordinates queues, rate limiting, and execution.
 */

import { randomUUID } from 'node:crypto';
import type {
  IResourceBroker,
  ResourceConfig,
  ResourceRequest,
  ResourceResponse,
  ResourceBrokerStats,
  ResourceStats,
  RateLimitBackend,
  RateLimitConfig,
  QueueItem,
} from '../types.js';
import { DEFAULT_RATE_LIMIT_CONFIG, DEFAULT_RETRY_CONFIG } from '../types.js';
import { PriorityQueue } from '../queue/priority-queue.js';
import { getRateLimitConfig } from '../rate-limit/presets.js';
import { shouldRetry, sleep } from '../retry/retry-strategy.js';

/**
 * Internal resource registration with resolved config.
 */
interface RegisteredResource {
  config: ResourceConfig;
  rateLimits: RateLimitConfig;
  stats: {
    totalRequests: number;
    totalSuccess: number;
    totalErrors: number;
    totalWaitTime: number;
    totalProcessingTime: number;
  };
}

/**
 * ResourceBroker - Centralized coordinator for heavy platform resources.
 *
 * Features:
 * - Priority queue (high/normal/low)
 * - Rate limiting with configurable backend (in-memory or distributed)
 * - Automatic retry with exponential backoff
 * - Graceful shutdown
 * - Per-resource statistics
 *
 * The platform doesn't know about plugins - only manages resources.
 * Any caller can enqueue requests with appropriate priority.
 *
 * @example
 * ```typescript
 * const backend = new InMemoryRateLimitBackend();
 * const broker = new ResourceBroker(backend);
 *
 * // Register resources
 * broker.register('llm', {
 *   rateLimits: 'openai-tier-2',
 *   executor: (op, args) => llmAdapter[op](...args),
 * });
 *
 * // Enqueue request
 * const response = await broker.enqueue({
 *   resource: 'llm',
 *   operation: 'complete',
 *   args: [prompt, options],
 *   priority: 'high',
 *   estimatedTokens: 1000,
 * });
 * ```
 */
export class ResourceBroker implements IResourceBroker {
  private resources = new Map<string, RegisteredResource>();
  private queue = new PriorityQueue();
  private processing = false;
  private shuttingDown = false;
  private startTime = Date.now();

  /**
   * Active processing count per resource (for concurrent limit tracking).
   */
  private activeProcessing = new Map<string, number>();

  constructor(private rateLimitBackend: RateLimitBackend) {}

  /**
   * Register a resource with its configuration.
   *
   * @param resource - Resource identifier ('llm', 'embeddings', 'vectorStore')
   * @param config - Resource configuration including executor
   */
  register(resource: string, config: ResourceConfig): void {
    // Resolve rate limits (preset name or config object)
    const rateLimits =
      typeof config.rateLimits === 'string'
        ? getRateLimitConfig(config.rateLimits)
        : config.rateLimits ?? DEFAULT_RATE_LIMIT_CONFIG;

    this.resources.set(resource, {
      config,
      rateLimits,
      stats: {
        totalRequests: 0,
        totalSuccess: 0,
        totalErrors: 0,
        totalWaitTime: 0,
        totalProcessingTime: 0,
      },
    });

    this.activeProcessing.set(resource, 0);
  }

  /**
   * Enqueue a request for execution.
   *
   * @param request - Resource request (without id and createdAt)
   * @returns Promise that resolves with response when execution completes
   */
  enqueue<T>(
    request: Omit<ResourceRequest, 'id' | 'createdAt'>
  ): Promise<ResourceResponse<T>> {
    if (this.shuttingDown) {
      return Promise.resolve({
        success: false,
        error: new Error('ResourceBroker is shutting down'),
        retries: 0,
        waitTime: 0,
        processingTime: 0,
        totalTime: 0,
      });
    }

    const registered = this.resources.get(request.resource);
    if (!registered) {
      return Promise.resolve({
        success: false,
        error: new Error(`Resource not registered: ${request.resource}`),
        retries: 0,
        waitTime: 0,
        processingTime: 0,
        totalTime: 0,
      });
    }

    // Create full request
    const fullRequest: ResourceRequest = {
      ...request,
      id: randomUUID(),
      createdAt: Date.now(),
      timeout: request.timeout ?? registered.config.timeout ?? 60000,
      maxRetries: request.maxRetries ?? registered.config.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    };

    // Create promise that will be resolved when execution completes
    return new Promise<ResourceResponse<T>>((resolve, reject) => {
      const item: QueueItem = {
        request: fullRequest,
        resolve: resolve as (response: ResourceResponse) => void,
        reject,
        enqueuedAt: Date.now(),
      };

      this.queue.enqueue(item);
      registered.stats.totalRequests++;

      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Process queue items continuously.
   */
  private async processQueue(): Promise<void> {
    // Avoid multiple concurrent processors
    if (this.processing) {
      return;
    }

    this.processing = true;

    try {
      while (!this.queue.isEmpty() && !this.shuttingDown) {
        const item = this.queue.peek();
        if (!item) {break;}

        const registered = this.resources.get(item.request.resource);
        if (!registered) {
          // Resource was unregistered - reject and move on
          this.queue.dequeue();
          item.reject(new Error(`Resource not registered: ${item.request.resource}`));
          continue;
        }

        // Check rate limits
        const tokens = item.request.estimatedTokens ?? 0;
        const acquireResult = await this.rateLimitBackend.acquire(
          item.request.resource,
          tokens,
          registered.rateLimits
        );

        if (!acquireResult.allowed) {
          // Wait and try again
          await sleep(acquireResult.waitTimeMs ?? 100);
          continue;
        }

        // Dequeue and process
        this.queue.dequeue();

        // Track active processing
        const currentActive = this.activeProcessing.get(item.request.resource) ?? 0;
        this.activeProcessing.set(item.request.resource, currentActive + 1);

        // Process in background (don't block queue processing)
        this.executeItem(item, registered).catch(() => {
          // Errors are handled in executeItem
        });
      }
    } finally {
      this.processing = false;

      // Check if there are more items (could have been added during processing)
      if (!this.queue.isEmpty() && !this.shuttingDown) {
        // Schedule next processing cycle
        setImmediate(() => this.processQueue());
      }
    }
  }

  /**
   * Execute a single queue item with retry logic.
   */
  private async executeItem(
    item: QueueItem,
    registered: RegisteredResource
  ): Promise<void> {
    const startTime = Date.now();
    const waitTime = startTime - item.enqueuedAt;

    let retries = 0;
    let lastError: Error | undefined;

    const retryConfig = {
      maxRetries: item.request.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
      baseDelay: registered.config.baseDelay ?? DEFAULT_RETRY_CONFIG.baseDelay,
      maxDelay: registered.config.maxDelay ?? DEFAULT_RETRY_CONFIG.maxDelay,
      jitter: DEFAULT_RETRY_CONFIG.jitter,
      retryableErrors: DEFAULT_RETRY_CONFIG.retryableErrors,
    };

    try {
      for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        try {
          // Create timeout promise
          const timeoutMs = item.request.timeout ?? 60000;
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`Request timeout after ${timeoutMs}ms`)), timeoutMs);
          });

          // Execute operation
          const executionPromise = registered.config.executor(
            item.request.operation,
            item.request.args
          );

          const result = await Promise.race([executionPromise, timeoutPromise]);

          // Success
          const endTime = Date.now();
          const processingTime = endTime - startTime;

          registered.stats.totalSuccess++;
          registered.stats.totalWaitTime += waitTime;
          registered.stats.totalProcessingTime += processingTime;

          item.resolve({
            success: true,
            data: result,
            retries,
            waitTime,
            processingTime,
            totalTime: endTime - item.enqueuedAt,
          });

          return;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          retries = attempt;

          const decision = shouldRetry(error, attempt, retryConfig);

          if (!decision.shouldRetry) {
            break;
          }

          // Wait before retry
          await sleep(decision.delayMs);

          // Re-acquire rate limit capacity for retry
          const tokens = item.request.estimatedTokens ?? 0;
          const acquireResult = await this.rateLimitBackend.acquire(
            item.request.resource,
            tokens,
            registered.rateLimits
          );

          if (!acquireResult.allowed && acquireResult.waitTimeMs) {
            await sleep(acquireResult.waitTimeMs);
          }
        }
      }

      // All retries exhausted
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      registered.stats.totalErrors++;
      registered.stats.totalWaitTime += waitTime;
      registered.stats.totalProcessingTime += processingTime;

      item.resolve({
        success: false,
        error: lastError,
        retries,
        waitTime,
        processingTime,
        totalTime: endTime - item.enqueuedAt,
      });
    } finally {
      // Release rate limit slot
      await this.rateLimitBackend.release(item.request.resource);

      // Update active processing count
      const currentActive = this.activeProcessing.get(item.request.resource) ?? 1;
      this.activeProcessing.set(item.request.resource, Math.max(0, currentActive - 1));
    }
  }

  /**
   * Get broker statistics.
   */
  getStats(): ResourceBrokerStats {
    const resources: Record<string, ResourceStats> = {};
    let totalRequests = 0;
    let totalSuccess = 0;
    let totalErrors = 0;

    for (const [resourceName, registered] of this.resources) {
      const queueByPriority = this.queue.sizeByPriority();
      const queueSize = this.queue.sizeByResource(resourceName);
      const activeRequests = this.activeProcessing.get(resourceName) ?? 0;

      // Get rate limit stats (synchronously create placeholder, async update later)
      const rateLimitStats = {
        resource: resourceName,
        tokensThisMinute: 0,
        requestsThisMinute: 0,
        requestsThisSecond: 0,
        activeRequests,
        totalRequests: registered.stats.totalRequests,
        totalTokens: 0,
        waitCount: 0,
        totalWaitTime: registered.stats.totalWaitTime,
      };

      const avgWaitTime =
        registered.stats.totalRequests > 0
          ? registered.stats.totalWaitTime / registered.stats.totalRequests
          : 0;

      const avgProcessingTime =
        registered.stats.totalRequests > 0
          ? registered.stats.totalProcessingTime / registered.stats.totalRequests
          : 0;

      resources[resourceName] = {
        rateLimits: rateLimitStats,
        queueSize,
        queueByPriority,
        totalRequests: registered.stats.totalRequests,
        totalSuccess: registered.stats.totalSuccess,
        totalErrors: registered.stats.totalErrors,
        avgWaitTime,
        avgProcessingTime,
      };

      totalRequests += registered.stats.totalRequests;
      totalSuccess += registered.stats.totalSuccess;
      totalErrors += registered.stats.totalErrors;
    }

    return {
      resources,
      totalRequests,
      totalSuccess,
      totalErrors,
      queueSize: this.queue.size(),
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Graceful shutdown - drain queues and stop processing.
   *
   * @param timeoutMs - Maximum time to wait for drain (default: 30000)
   */
  async shutdown(timeoutMs = 30000): Promise<void> {
    this.shuttingDown = true;

    const startTime = Date.now();

    // Wait for queue to drain or timeout
    while (!this.queue.isEmpty() && Date.now() - startTime < timeoutMs) {
      await sleep(100);
    }

    // Reject remaining items
    const remaining = this.queue.clear();
    for (const item of remaining) {
      item.resolve({
        success: false,
        error: new Error('ResourceBroker shutdown'),
        retries: 0,
        waitTime: Date.now() - item.enqueuedAt,
        processingTime: 0,
        totalTime: Date.now() - item.enqueuedAt,
      });
    }
  }

  /**
   * Check if broker is shutting down.
   */
  isShuttingDown(): boolean {
    return this.shuttingDown;
  }

  /**
   * Get registered resource names.
   */
  getRegisteredResources(): string[] {
    return Array.from(this.resources.keys());
  }

  /**
   * Check if a resource is registered.
   */
  hasResource(resource: string): boolean {
    return this.resources.has(resource);
  }

  /**
   * Unregister a resource.
   * Note: Pending requests for this resource will fail.
   */
  unregister(resource: string): void {
    this.resources.delete(resource);
    this.activeProcessing.delete(resource);
  }
}
