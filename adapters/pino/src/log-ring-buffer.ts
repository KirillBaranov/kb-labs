/**
 * @module @kb-labs/adapters-pino/log-ring-buffer
 * Ring buffer for in-memory log storage with real-time streaming
 */

import type {
  LogRecord,
  LogQuery,
  ILogBuffer,
  LogLevel,
} from "@kb-labs/core-platform";

/**
 * Ring buffer implementation for log storage
 */
export class LogRingBuffer implements ILogBuffer {
  private buffer: LogRecord[] = [];
  private subscribers: Set<(record: LogRecord) => void> = new Set();
  private readonly maxSize: number;
  private readonly maxAge: number;

  constructor(maxSize: number = 1000, maxAge: number = 3600000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge; // milliseconds
  }

  /**
   * Append log record to buffer
   */
  append(record: LogRecord): void {
    // Add to buffer
    this.buffer.push(record);

    // Evict old entries by size
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }

    // Evict old entries by age
    const now = Date.now();
    const cutoff = now - this.maxAge;
    while (this.buffer.length > 0 && this.buffer[0]!.timestamp < cutoff) {
      this.buffer.shift();
    }

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(record);
      } catch (error) {
        // Ignore subscriber errors
        console.error("[LogRingBuffer] Subscriber error:", error);
      }
    }
  }

  /**
   * Query logs with filters
   */
  query(query?: LogQuery): LogRecord[] {
    let results = [...this.buffer];

    if (!query) {
      return results;
    }

    // Filter by time range
    if (query.from !== undefined) {
      results = results.filter((r) => r.timestamp >= query.from!);
    }
    if (query.to !== undefined) {
      results = results.filter((r) => r.timestamp <= query.to!);
    }

    // Filter by source
    if (query.source !== undefined) {
      results = results.filter((r) => r.source === query.source);
    }

    // Filter by level (minimum level)
    if (query.level !== undefined) {
      const levels: LogLevel[] = [
        "trace",
        "debug",
        "info",
        "warn",
        "error",
        "fatal",
      ];
      const minLevelIndex = levels.indexOf(query.level);
      results = results.filter((r) => {
        const recordLevelIndex = levels.indexOf(r.level);
        return recordLevelIndex >= minLevelIndex;
      });
    }

    // Apply limit
    if (query.limit !== undefined && query.limit > 0) {
      results = results.slice(-query.limit); // Take most recent N
    }

    return results;
  }

  /**
   * Subscribe to real-time log stream
   */
  subscribe(callback: (record: LogRecord) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Find log by ID in buffer
   */
  findById(id: string): LogRecord | undefined {
    return this.buffer.find((record) => record.id === id);
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    total: number;
    bufferSize: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  } {
    return {
      total: this.buffer.length,
      bufferSize: this.maxSize,
      oldestTimestamp:
        this.buffer.length > 0 ? this.buffer[0]!.timestamp : null,
      newestTimestamp:
        this.buffer.length > 0
          ? this.buffer[this.buffer.length - 1]!.timestamp
          : null,
    };
  }
}
