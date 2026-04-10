/**
 * @module @kb-labs/adapters-log-ringbuffer
 * In-memory ring buffer adapter for real-time log streaming.
 *
 * Features:
 * - Fixed-size circular buffer (default 1000 logs)
 * - Time-to-live expiration (default 1 hour)
 * - Real-time subscription support
 * - Automatic eviction of oldest logs
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-log-ringbuffer';
 *
 * const buffer = createAdapter({
 *   maxSize: 1000,
 *   ttl: 3600000, // 1 hour
 * });
 *
 * // Append logs
 * buffer.append({
 *   timestamp: Date.now(),
 *   level: 'info',
 *   message: 'Server started',
 *   fields: {},
 *   source: 'rest-api',
 * });
 *
 * // Subscribe to real-time stream
 * const unsubscribe = buffer.subscribe((log) => {
 *   console.log('New log:', log);
 * });
 *
 * // Query logs
 * const recentErrors = buffer.query({ level: 'error' });
 * console.log(recentErrors);
 *
 * // Clean up
 * unsubscribe();
 * ```
 */

import type {
  ILogRingBuffer,
  LogRingBufferConfig,
  LogRecord,
  LogQuery,
} from "@kb-labs/core-platform/adapters";

// Re-export manifest
export { manifest } from "./manifest.js";

/**
 * In-memory ring buffer for log streaming.
 *
 * Implementation details:
 * - Uses circular array for O(1) append
 * - Lazy TTL eviction (on query/append)
 * - No locks needed (single-threaded Node.js)
 * - Memory-bounded by maxSize
 */
export class LogRingBufferAdapter implements ILogRingBuffer {
  private buffer: LogRecord[] = [];
  private maxSize: number;
  private ttl: number;
  private subscribers: Set<(record: LogRecord) => void> = new Set();
  private evictions = 0;

  constructor(config: LogRingBufferConfig = {}) {
    this.maxSize = config.maxSize ?? 1000;
    this.ttl = config.ttl ?? 3600000; // 1 hour
  }

  /**
   * Append log record to buffer.
   * Evicts oldest log if buffer is full.
   */
  append(record: LogRecord): void {
    // Remove expired logs before adding new one
    this.evictExpired();

    // Add new log
    this.buffer.push(record);

    // Evict oldest if buffer is full
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
      this.evictions++;
    }

    // Notify subscribers (real-time streaming)
    this.notifySubscribers(record);
  }

  /**
   * Query logs from buffer with optional filters.
   * Returns logs in reverse chronological order (newest first).
   */
  query(query?: LogQuery): LogRecord[] {
    // Remove expired logs before querying
    this.evictExpired();

    let results = [...this.buffer];

    // Apply filters
    if (query?.level) {
      results = results.filter((r) => r.level === query.level);
    }

    if (query?.from !== undefined) {
      results = results.filter((r) => r.timestamp >= query.from!);
    }

    if (query?.to !== undefined) {
      results = results.filter((r) => r.timestamp <= query.to!);
    }

    if (query?.source) {
      results = results.filter((r) => r.source === query.source);
    }

    // Apply limit
    if (query?.limit !== undefined && query.limit > 0) {
      results = results.slice(-query.limit);
    }

    // Return newest first
    return results.reverse();
  }

  /**
   * Subscribe to real-time log events.
   * Callback is invoked synchronously for each new log.
   */
  subscribe(callback: (record: LogRecord) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Get buffer statistics.
   */
  getStats() {
    this.evictExpired();

    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      oldestTimestamp: this.buffer[0]?.timestamp ?? 0,
      newestTimestamp: this.buffer[this.buffer.length - 1]?.timestamp ?? 0,
      evictions: this.evictions,
    };
  }

  /**
   * Clear all logs from buffer.
   * Useful for testing or manual cleanup.
   */
  clear(): void {
    this.buffer = [];
    this.evictions = 0;
  }

  /**
   * Evict expired logs based on TTL.
   * Called lazily on append/query operations.
   */
  private evictExpired(): void {
    if (this.buffer.length === 0) {
      return;
    }

    const now = Date.now();
    const cutoff = now - this.ttl;

    // Remove logs older than TTL from beginning of buffer
    while (this.buffer.length > 0 && this.buffer[0]!.timestamp < cutoff) {
      this.buffer.shift();
      this.evictions++;
    }
  }

  /**
   * Notify all subscribers about new log.
   */
  private notifySubscribers(record: LogRecord): void {
    this.subscribers.forEach((callback) => {
      try {
        callback(record);
      } catch (error) {
        // Don't let subscriber errors crash the buffer
        console.error("Error in log buffer subscriber:", error);
      }
    });
  }
}

/**
 * Factory function for creating ring buffer adapter.
 * This is the function called by platform initialization.
 *
 * @param config - Ring buffer configuration
 * @returns Ring buffer adapter instance
 */
export function createAdapter(
  config?: LogRingBufferConfig,
): LogRingBufferAdapter {
  return new LogRingBufferAdapter(config);
}

// Default export for convenience
export default createAdapter;
