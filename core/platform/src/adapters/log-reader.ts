/**
 * @module @kb-labs/core-platform/adapters/log-reader
 * Read-only adapter interface for querying logs.
 *
 * Purpose:
 * - Abstract log storage backends (SQLite, ring buffer, remote API)
 * - Provide unified read API for all log queries
 * - Enable configuration-driven backend selection
 *
 * Separation Rationale:
 * - ILogger: Write logs (info, error, warn) + extensions (buffer, persistence)
 * - ILogReader: Read logs (query, getById, search) - this interface
 *
 * Design:
 * - REST API and plugins use this adapter instead of directly accessing ILogBuffer or ILogPersistence
 * - Implementation automatically selects best backend (persistence > buffer > error)
 * - Graceful degradation if backends unavailable
 *
 * @example
 * ```typescript
 * // In REST API or plugin
 * const reader = platform.getAdapter<ILogReader>('logReader');
 *
 * const logs = await reader.query(
 *   { level: 'error', from: Date.now() - 3600000 },
 *   { limit: 50 }
 * );
 *
 * const log = await reader.getById('log-123');
 *
 * const results = await reader.search('authentication failed');
 *
 * const unsubscribe = reader.subscribe((log) => {
 *   console.log('New log:', log);
 * });
 * ```
 */

import type { LogRecord, LogQuery } from "./logger";

/**
 * Query options for log retrieval.
 */
export interface LogQueryOptions {
  /** Maximum number of logs to return (default: 100) */
  limit?: number;
  /** Number of logs to skip for pagination (default: 0) */
  offset?: number;
  /** Sort by field (default: 'timestamp') */
  sortBy?: "timestamp" | "level";
  /** Sort order (default: 'desc' - newest first) */
  sortOrder?: "asc" | "desc";
}

/**
 * Result of log query operation.
 */
export interface LogQueryResult {
  /** Logs matching query criteria */
  logs: LogRecord[];
  /** Total number of logs matching query (ignoring limit/offset) */
  total: number;
  /** True if more results are available (offset + logs.length < total) */
  hasMore: boolean;
  /** Source of data (for debugging/monitoring) */
  source: "buffer" | "persistence" | "hybrid";
}

/**
 * Search options for full-text search.
 */
export interface LogSearchOptions {
  /** Maximum number of logs to return (default: 100) */
  limit?: number;
  /** Number of logs to skip for pagination (default: 0) */
  offset?: number;
}

/**
 * Result of log search operation.
 */
export interface LogSearchResult {
  /** Logs matching search query */
  logs: LogRecord[];
  /** Total number of logs matching search */
  total: number;
  /** True if more results are available */
  hasMore: boolean;
}

/**
 * Statistics about available log storage.
 */
export interface LogStats {
  /** Ring buffer statistics (if available) */
  buffer?: {
    /** Current number of logs in buffer */
    size: number;
    /** Maximum buffer capacity */
    maxSize: number;
    /** Timestamp of oldest log in buffer (null if empty) */
    oldestTimestamp: number | null;
    /** Timestamp of newest log in buffer (null if empty) */
    newestTimestamp: number | null;
  };
  /** Persistent storage statistics (if available) */
  persistence?: {
    /** Total number of logs in storage */
    totalLogs: number;
    /** Timestamp of oldest log (0 if empty) */
    oldestTimestamp: number;
    /** Timestamp of newest log (0 if empty) */
    newestTimestamp: number;
    /** Storage size in bytes */
    sizeBytes: number;
  };
}

/**
 * Capabilities of available log backends.
 */
export interface LogCapabilities {
  /** Ring buffer available (real-time streaming) */
  hasBuffer: boolean;
  /** Persistent storage available (historical queries) */
  hasPersistence: boolean;
  /** Full-text search available (FTS) */
  hasSearch: boolean;
  /** Real-time streaming available (SSE) */
  hasStreaming: boolean;
}

/**
 * Read-only log adapter interface.
 *
 * This adapter abstracts log storage backends (SQLite, ring buffer, remote API, etc.).
 * REST API and plugins use this instead of directly accessing ILogBuffer or ILogPersistence.
 *
 * Implementations automatically select best backend:
 * 1. If persistence available → use it (complete historical data)
 * 2. If only buffer available → use it (recent logs only)
 * 3. If neither → error 503
 *
 * Common implementations:
 * - HybridLogReader: Combines persistence + buffer with automatic fallback
 * - PersistenceLogReader: SQLite/PostgreSQL only
 * - BufferLogReader: Ring buffer only
 * - RemoteLogReader: Fetch from remote API
 *
 * @example
 * ```typescript
 * // Get adapter from platform
 * const reader = platform.getAdapter<ILogReader>('logReader');
 *
 * // Query recent errors
 * const errors = await reader.query(
 *   { level: 'error', from: Date.now() - 3600000 },
 *   { limit: 10 }
 * );
 *
 * // Get specific log
 * const log = await reader.getById('log-123');
 *
 * // Full-text search
 * const results = await reader.search('authentication failed');
 *
 * // Subscribe to real-time stream
 * const unsubscribe = reader.subscribe((log) => {
 *   if (log.level === 'error') {
 *     console.error('New error:', log);
 *   }
 * });
 * ```
 */
export interface ILogReader {
  /**
   * Query logs with filters and pagination.
   *
   * Automatically selects best backend:
   * - Persistence (if available): complete historical data
   * - Buffer (if available): recent logs only
   * - Neither: throws error
   *
   * @param filters - Query filters (level, source, time range)
   * @param options - Pagination and sorting options
   * @returns Promise with logs, total count, and pagination info
   *
   * @example
   * ```typescript
   * const reader = platform.getAdapter<ILogReader>('logReader');
   *
   * // Get last 50 error logs
   * const result = await reader.query(
   *   { level: 'error' },
   *   { limit: 50, sortBy: 'timestamp', sortOrder: 'desc' }
   * );
   *
   * console.log(result.logs);     // Array of 50 logs
   * console.log(result.total);    // Total matching logs
   * console.log(result.hasMore);  // true if more pages exist
   * console.log(result.source);   // 'persistence' | 'buffer'
   * ```
   */
  query(filters: LogQuery, options?: LogQueryOptions): Promise<LogQueryResult>;

  /**
   * Get single log record by ID.
   *
   * Searches both ring buffer and persistence (if available).
   *
   * @param id - Log record ID
   * @returns Promise with log record or null if not found
   *
   * @example
   * ```typescript
   * const log = await reader.getById('log-abc123');
   * if (log) {
   *   console.log(log.message);
   *   console.log(log.fields);
   * }
   * ```
   */
  getById(id: string): Promise<LogRecord | null>;

  /**
   * Full-text search logs by text query.
   *
   * Uses database FTS (Full-Text Search) if available, otherwise falls back
   * to simple text matching in buffer.
   *
   * @param searchText - Search query (database-specific syntax supported)
   * @param options - Pagination options
   * @returns Promise with matching logs
   *
   * @example
   * ```typescript
   * // Simple search
   * const results = await reader.search('authentication failed');
   *
   * // Advanced search (SQLite FTS5 syntax)
   * const results = await reader.search('auth* AND (error OR warn)');
   * ```
   */
  search(
    searchText: string,
    options?: LogSearchOptions,
  ): Promise<LogSearchResult>;

  /**
   * Subscribe to real-time log stream.
   *
   * Requires ring buffer to be available. If not, throws error.
   *
   * @param callback - Function to call on each new log
   * @param filters - Optional filters to apply to stream
   * @returns Unsubscribe function to stop receiving logs
   *
   * @example
   * ```typescript
   * // Subscribe to all logs
   * const unsubscribe = reader.subscribe((log) => {
   *   console.log('New log:', log.message);
   * });
   *
   * // Subscribe to errors only
   * const unsubscribe = reader.subscribe(
   *   (log) => console.error('Error:', log),
   *   { level: 'error' }
   * );
   *
   * // Later: unsubscribe()
   * ```
   */
  subscribe(callback: (log: LogRecord) => void, filters?: LogQuery): () => void;

  /**
   * Get statistics about available log storage.
   *
   * Returns combined statistics from both ring buffer and persistence
   * (if available).
   *
   * @returns Promise with statistics
   *
   * @example
   * ```typescript
   * const stats = await reader.getStats();
   *
   * if (stats.buffer) {
   *   console.log('Buffer size:', stats.buffer.size);
   *   console.log('Buffer max:', stats.buffer.maxSize);
   * }
   *
   * if (stats.persistence) {
   *   console.log('Total logs:', stats.persistence.totalLogs);
   *   console.log('DB size:', stats.persistence.sizeBytes);
   * }
   * ```
   */
  getStats(): Promise<LogStats>;

  /**
   * Check which backends and features are available.
   *
   * Useful for conditionally enabling UI features or choosing query strategies.
   *
   * @returns Object with boolean flags for each capability
   *
   * @example
   * ```typescript
   * const caps = reader.getCapabilities();
   *
   * if (caps.hasSearch) {
   *   // Show search UI
   * }
   *
   * if (caps.hasStreaming) {
   *   // Enable real-time log streaming
   * }
   *
   * if (caps.hasPersistence) {
   *   // Show "View All Logs" button
   * }
   * ```
   */
  getCapabilities(): LogCapabilities;
}
