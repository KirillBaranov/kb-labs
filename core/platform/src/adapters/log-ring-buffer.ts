/**
 * @module @kb-labs/core-platform/adapters/log-ring-buffer
 * Ring buffer adapter interface for real-time log streaming.
 *
 * Purpose:
 * - In-memory buffer with fixed size and TTL
 * - Real-time subscription support (SSE)
 * - Low latency access to recent logs
 *
 * Not for:
 * - Historical queries (use ILogPersistence)
 * - Cross-process log aggregation
 * - Long-term storage
 */

import type { LogRecord, LogQuery } from "./logger";

/**
 * Ring buffer for real-time log streaming.
 *
 * Design:
 * - Fixed-size circular buffer (default 1000 logs)
 * - Automatic eviction of oldest logs when buffer is full
 * - Time-to-live expiration (default 1 hour)
 * - Real-time subscription support for SSE streaming
 *
 * @example
 * ```typescript
 * const buffer = createRingBufferAdapter({ maxSize: 1000, ttl: 3600000 });
 *
 * // Append logs
 * buffer.append({ timestamp: Date.now(), level: 'info', message: 'Hello' });
 *
 * // Subscribe to real-time stream
 * const unsubscribe = buffer.subscribe((log) => {
 *   console.log('New log:', log);
 * });
 *
 * // Query recent logs
 * const recentErrors = buffer.query({ level: 'error' });
 * ```
 */
export interface ILogRingBuffer {
  /**
   * Append log record to buffer.
   * Evicts oldest record if buffer is full.
   *
   * @param record - Log record to append
   */
  append(record: LogRecord): void;

  /**
   * Query logs from buffer.
   *
   * @param query - Optional filter (level, timestamp range, source)
   * @returns Array of logs matching query (most recent first)
   */
  query(query?: LogQuery): LogRecord[];

  /**
   * Subscribe to real-time log events.
   * Callback is called for each new log record appended to buffer.
   *
   * @param callback - Called for each new log record
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = buffer.subscribe((log) => {
   *   if (log.level === 'error') {
   *     notifyUser(log);
   *   }
   * });
   *
   * // Later: stop subscription
   * unsubscribe();
   * ```
   */
  subscribe(callback: (record: LogRecord) => void): () => void;

  /**
   * Get buffer statistics.
   *
   * @returns Buffer stats including size, capacity, and eviction count
   */
  getStats(): {
    /** Current number of logs in buffer */
    size: number;
    /** Maximum buffer size */
    maxSize: number;
    /** Timestamp of oldest log in buffer (0 if empty) */
    oldestTimestamp: number;
    /** Timestamp of newest log in buffer (0 if empty) */
    newestTimestamp: number;
    /** Total number of logs evicted due to size/TTL */
    evictions: number;
  };

  /**
   * Clear all logs from buffer.
   * Useful for testing or manual cleanup.
   */
  clear(): void;
}

/**
 * Configuration for log ring buffer adapter.
 */
export interface LogRingBufferConfig {
  /**
   * Maximum number of logs to keep in memory.
   * When buffer is full, oldest log is evicted.
   *
   * @default 1000
   */
  maxSize?: number;

  /**
   * Time-to-live for logs in milliseconds.
   * Logs older than this are automatically evicted.
   *
   * @default 3600000 (1 hour)
   */
  ttl?: number;
}
