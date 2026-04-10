/**
 * @module @kb-labs/adapters-log-sqlite
 * SQLite persistence adapter for KB Labs logs.
 *
 * Features:
 * - Automatic schema initialization
 * - Batch writes with auto-flush
 * - Full-text search support (FTS5)
 * - Retention policy support
 * - Cross-process log aggregation
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-log-sqlite';
 * import { createAdapter as createDB } from '@kb-labs/adapters-sqlite';
 *
 * const db = createDB({ filename: '.kb/data/kb.db' });
 * const persistence = await createAdapter({
 *   database: db,
 *   batchSize: 100,
 *   flushInterval: 5000,
 * });
 *
 * // Write logs
 * await persistence.write({
 *   timestamp: Date.now(),
 *   level: 'info',
 *   message: 'Server started',
 *   fields: { port: 3000 },
 *   source: 'rest-api',
 * });
 *
 * // Query logs
 * const result = await persistence.query(
 *   { level: 'error', from: Date.now() - 3600000 },
 *   { limit: 50, offset: 0 }
 * );
 *
 * // Search logs
 * const searchResults = await persistence.search('authentication failed');
 *
 * // Clean up
 * await persistence.close();
 * ```
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
  ILogPersistence,
  LogPersistenceConfig,
  LogRetentionPolicy,
  LogRecord,
  LogQuery,
  ISQLDatabase,
} from "@kb-labs/core-platform/adapters";
import { generateLogId } from "@kb-labs/core-platform/adapters";

/** Default retention: 7 days for warn/error/fatal */
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
/** Default retention: 1 hour for debug/trace */
const DEFAULT_MAX_AGE_DEBUG = 60 * 60 * 1000;
/** Default retention: 24 hours for info */
const DEFAULT_MAX_AGE_INFO = 24 * 60 * 60 * 1000;
/** Default max DB size: 500 MB */
const DEFAULT_MAX_SIZE_BYTES = 500 * 1024 * 1024;
/** Default cleanup interval: 5 minutes */
const DEFAULT_CLEANUP_INTERVAL = 5 * 60 * 1000;
/** Batch size for size-based cleanup deletes */
const SIZE_CLEANUP_BATCH = 10_000;
/** Check DB size every N retention cycles (not every cycle) */
const SIZE_CHECK_EVERY_N_CYCLES = 10;
/** Levels that are filtered by maxAgeDebug */
const DEBUG_LEVELS = ["debug", "trace"];
/** Levels that are filtered by maxAgeInfo */
const INFO_LEVELS = ["info"];
/** Levels that are filtered by maxAge */
const IMPORTANT_LEVELS = ["warn", "error", "fatal"];

// Re-export manifest
export { manifest } from "./manifest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Adapter manifest for SQLite log persistence extension.
 */

/**
 * SQLite persistence adapter for logs.
 *
 * Design:
 * - Batched writes for performance (default 100 logs per batch)
 * - Auto-flush on interval (default 5 seconds)
 * - FTS5 full-text search on message field
 * - Composite indexes for common query patterns
 * - Shared database for cross-process aggregation
 */
export class LogSQLitePersistence implements ILogPersistence {
  private db: ISQLDatabase;
  private tableName: string;
  private batchSize: number;
  private flushInterval: number;
  private writeQueue: LogRecord[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private maxRetries: number;
  private retryBaseDelayMs: number;
  private retryMaxDelayMs: number;
  private maxQueueSize: number;
  private droppedLogs = 0;
  private nextFlushNotBefore = 0;
  private shuttingDown = false;
  private closed = false;
  private closedWarningLogged = false;
  private ftsRebuildInProgress = false;

  // Retention policy
  private retentionMaxAge: number;
  private retentionMaxAgeDebug: number;
  private retentionMaxAgeInfo: number;
  private retentionMaxSizeBytes: number;
  private retentionCleanupIntervalMs: number;
  private retentionCycleCount = 0;
  private totalWritesSinceLastRetention = 0;
  private lastRetentionDeletedAny = true; // assume dirty on first run

  constructor(config: LogPersistenceConfig) {
    this.db = config.database;
    this.tableName = config.tableName ?? "logs";
    this.batchSize = config.batchSize ?? 100;
    this.flushInterval = config.flushInterval ?? 5000; // 5 seconds
    const runtime = config as LogPersistenceConfig & {
      retryAttempts?: number;
      retryBaseDelayMs?: number;
      retryMaxDelayMs?: number;
      maxQueueSize?: number;
    };
    this.maxRetries = runtime.retryAttempts ?? 5;
    this.retryBaseDelayMs = runtime.retryBaseDelayMs ?? 50;
    this.retryMaxDelayMs = runtime.retryMaxDelayMs ?? 3000;
    this.maxQueueSize = runtime.maxQueueSize ?? 10_000;

    // Retention policy (defaults always apply to prevent unbounded growth)
    const retention: LogRetentionPolicy = config.retention ?? {};
    this.retentionMaxAge = retention.maxAge ?? DEFAULT_MAX_AGE;
    this.retentionMaxAgeDebug = retention.maxAgeDebug ?? DEFAULT_MAX_AGE_DEBUG;
    this.retentionMaxAgeInfo = retention.maxAgeInfo ?? DEFAULT_MAX_AGE_INFO;
    this.retentionMaxSizeBytes = retention.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.retentionCleanupIntervalMs = retention.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL;
  }

  /**
   * Initialize database schema and start auto-flush timer.
   * Must be called before using the adapter.
   */
  async initialize(): Promise<void> {
    // Load and execute schema
    // Try dist/ first (production), then src/ (tests)
    let schemaSQL: string;
    try {
      const distPath = join(__dirname, "schema.sql");
      schemaSQL = readFileSync(distPath, "utf-8");
    } catch (_error) {
      const srcPath = join(__dirname, "../src/schema.sql");
      schemaSQL = readFileSync(srcPath, "utf-8");
    }

    // Execute schema using SQLite's exec method (handles multiple statements)
    // Remove SQL comments first
    const cleanSQL = schemaSQL
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    // SQLiteAdapter should have exec() method for schema migrations
    // Check if exec() is available (utility method in SQLiteAdapter)
    const hasExec = "exec" in this.db;
    const isFunction = typeof (this.db as any).exec === "function";

    if (hasExec && isFunction) {
      try {
        await (this.db as any).exec(cleanSQL);
      } catch (error) {
        console.error("[LogSQLitePersistence] Schema execution failed:", error);
        throw error;
      }
    } else {
      // Fallback: execute statements one by one
      const statements = cleanSQL
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
         
        await this.db.query(statement);
      }
    }

    // Start auto-flush timer
    this.startFlushTimer();

    // Start retention cleanup timer
    this.startRetentionTimer();
  }

  /**
   * Write log record to persistent storage.
   * Logs are queued and flushed in batches.
   * Debug/trace logs are skipped when maxAgeDebug is 0.
   */
  async write(record: LogRecord): Promise<void> {
    if (this.shuttingDown || this.closed) {
      return;
    }
    if (this.shouldSkipLevel(record.level)) {
      return;
    }
    this.enqueueRecords([record]);

    // Flush if batch is full
    if (this.writeQueue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Write multiple log records in batch.
   * More efficient than multiple write() calls.
   * Debug/trace logs are filtered when maxAgeDebug is 0.
   */
  async writeBatch(records: LogRecord[]): Promise<void> {
    if (this.shuttingDown || this.closed) {
      return;
    }
    const filtered = records.filter((r) => !this.shouldSkipLevel(r.level));
    if (filtered.length === 0) {
      return;
    }
    this.enqueueRecords(filtered);

    // Flush if batch is full
    if (this.writeQueue.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Query logs from persistent storage.
   */
  async query(
    query: LogQuery,
    options: {
      limit?: number;
      offset?: number;
      sortBy?: "timestamp" | "level";
      sortOrder?: "asc" | "desc";
    } = {},
  ): Promise<{
    logs: LogRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const sortBy = options.sortBy ?? "timestamp";
    const sortOrder = options.sortOrder ?? "desc";

    // Build WHERE clause
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.level) {
      conditions.push("level = ?");
      params.push(query.level);
    }

    if (query.from !== undefined) {
      conditions.push("timestamp >= ?");
      params.push(query.from);
    }

    if (query.to !== undefined) {
      conditions.push("timestamp <= ?");
      params.push(query.to);
    }

    if (query.source) {
      conditions.push("source = ?");
      params.push(query.source);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const countResult = await this.db.query<{ count: number }>(
      countQuery,
      params,
    );
    const total = countResult.rows[0]?.count ?? 0;

    // Get logs
    const logsQuery = `
      SELECT id, timestamp, level, message, source, fields
      FROM ${this.tableName}
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    const logsResult = await this.db.query<{
      id: string;
      timestamp: number;
      level: string;
      message: string;
      source: string;
      fields: string | null;
    }>(logsQuery, [...params, limit, offset]);

    const logs: LogRecord[] = logsResult.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as LogRecord["level"],
      message: row.message,
      source: row.source,
      fields: row.fields ? JSON.parse(row.fields) : {},
    }));

    return {
      logs,
      total,
      hasMore: offset + logs.length < total,
    };
  }

  /**
   * Get single log record by ID.
   */
  async getById(id: string): Promise<LogRecord | null> {
    const query = `
      SELECT id, timestamp, level, message, source, fields
      FROM ${this.tableName}
      WHERE id = ?
    `;

    const result = await this.db.query<{
      id: string;
      timestamp: number;
      level: string;
      message: string;
      source: string;
      fields: string | null;
    }>(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0]!;
    return {
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as LogRecord["level"],
      message: row.message,
      source: row.source,
      fields: row.fields ? JSON.parse(row.fields) : {},
    };
  }

  /**
   * Search logs by text query (full-text search).
   */
  async search(
    searchText: string,
    options: {
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{
    logs: LogRecord[];
    total: number;
    hasMore: boolean;
  }> {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const runSearch = async (queryText: string): Promise<{
      logs: LogRecord[];
      total: number;
      hasMore: boolean;
    }> => {
      // Count total matches
      const countQuery = `
        SELECT COUNT(*) as count
        FROM logs_fts
        WHERE logs_fts MATCH ?
      `;
      const countResult = await this.db.query<{ count: number }>(countQuery, [
        queryText,
      ]);
      const total = countResult.rows[0]?.count ?? 0;

      // Get matching logs
      const searchQuery = `
        SELECT logs.id, logs.timestamp, logs.level, logs.message, logs.source, logs.fields
        FROM logs_fts
        INNER JOIN logs ON logs.rowid = logs_fts.rowid
        WHERE logs_fts MATCH ?
        ORDER BY logs.timestamp DESC
        LIMIT ? OFFSET ?
      `;

      const searchResult = await this.db.query<{
        id: string;
        timestamp: number;
        level: string;
        message: string;
        source: string;
        fields: string | null;
      }>(searchQuery, [queryText, limit, offset]);

      const logs: LogRecord[] = searchResult.rows.map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        level: row.level as LogRecord["level"],
        message: row.message,
        source: row.source,
        fields: row.fields ? JSON.parse(row.fields) : {},
      }));

      return {
        logs,
        total,
        hasMore: offset + logs.length < total,
      };
    };

    const searchWithRepair = async (queryText: string): Promise<{
      logs: LogRecord[];
      total: number;
      hasMore: boolean;
    }> => {
      const initial = await runSearch(queryText);
      // Index drift symptom: MATCH count exists but JOIN returns no rows.
      if (initial.total > 0 && initial.logs.length === 0) {
        await this.rebuildFtsIndex();
        return runSearch(queryText);
      }
      return initial;
    };

    try {
      return await searchWithRepair(searchText);
    } catch (error) {
      // Common UX case: plain text with '-' (e.g. kb-labs) is parsed as FTS syntax.
      // Retry as exact phrase to preserve user-friendly behavior.
      if (this.isFtsSyntaxError(error)) {
        const escapedPhrase = `"${searchText.replace(/"/g, '""')}"`;
        return searchWithRepair(escapedPhrase);
      }
      throw error;
    }
  }

  /**
   * Delete logs older than specified timestamp.
   */
  async deleteOlderThan(beforeTimestamp: number): Promise<number> {
    const query = `DELETE FROM ${this.tableName} WHERE timestamp < ?`;
    const result = await this.db.query(query, [beforeTimestamp]);
    return result.rowCount ?? 0;
  }

  /**
   * Delete logs matching specific levels older than specified timestamp.
   */
  async deleteByLevelOlderThan(
    levels: string[],
    beforeTimestamp: number,
  ): Promise<number> {
    if (levels.length === 0) {
      return 0;
    }
    const placeholders = levels.map(() => "?").join(",");
    const query = `DELETE FROM ${this.tableName} WHERE level IN (${placeholders}) AND timestamp < ?`;
    const result = await this.db.query(query, [...levels, beforeTimestamp]);
    return result.rowCount ?? 0;
  }

  /**
   * Get statistics about stored logs.
   */
  async getStats(): Promise<{
    totalLogs: number;
    oldestTimestamp: number;
    newestTimestamp: number;
    sizeBytes: number;
  }> {
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COALESCE(MIN(timestamp), 0) as oldest,
        COALESCE(MAX(timestamp), 0) as newest
      FROM ${this.tableName}
    `;

    const statsResult = await this.db.query<{
      total: number;
      oldest: number;
      newest: number;
    }>(statsQuery);

    const row = statsResult.rows[0];

    // Get database file size (SQLite specific)
    let sizeBytes = 0;
    try {
      const sizeQuery = `SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()`;
      const sizeResult = await this.db.query<{ size: number }>(sizeQuery);
      sizeBytes = sizeResult.rows[0]?.size ?? 0;
    } catch {
      // Ignore if pragma not supported
    }

    return {
      totalLogs: row?.total ?? 0,
      oldestTimestamp: row?.oldest ?? 0,
      newestTimestamp: row?.newest ?? 0,
      sizeBytes,
    };
  }

  /**
   * Close persistence adapter and flush pending writes.
   */
  async close(): Promise<void> {
    this.shuttingDown = true;
    // Stop flush timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    // Stop retention timer
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }

    // Flush remaining logs
    await this.flush();
    this.closed = true;
  }

  /**
   * Flush pending logs to database.
   * @private
   */
   
  private async flush(): Promise<void> {
    if (this.writeQueue.length === 0 || this.flushing) {
      return;
    }
    if (Date.now() < this.nextFlushNotBefore) {
      return;
    }

    this.flushing = true;

    try {
      const batch = this.writeQueue.splice(0, this.writeQueue.length);
      const flushed = await this.flushWithRetry(batch);
      if (!flushed) {
        this.requeueToFront(batch);
      }
    } finally {
      this.flushing = false;
    }
  }

  private async flushWithRetry(batch: LogRecord[]): Promise<boolean> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        await this.insertBatch(batch);
        return true;
      } catch (error) {
        if (this.handleClosedFlushError(error)) {
          return true;
        }

        if (!this.isRetryableLockError(error)) {
          this.handleNonRetryableFlushError(batch, error);
          return true;
        }

        if (attempt >= this.maxRetries) {
          this.handleLockedFlushRetryExhausted(batch, attempt, error);
          return false;
        }

        const delay = this.computeRetryDelayMs(attempt);
        await this.sleep(delay);
      }
    }

    return false;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private handleClosedFlushError(error: unknown): boolean {
    if (!this.isClosedConnectionError(error)) {
      return false;
    }
    if (!this.closedWarningLogged && !this.shuttingDown) {
      this.closedWarningLogged = true;
      console.warn(
        "[LogSQLitePersistence] Database connection is closed, skipping persistence writes.",
      );
    }
    return true;
  }

  private handleNonRetryableFlushError(batch: LogRecord[], error: unknown): void {
    this.droppedLogs += batch.length;
    console.error(
      "[LogSQLitePersistence] Non-retryable flush failure, dropping batch:",
      {
        batchSize: batch.length,
        droppedLogs: this.droppedLogs,
        error: this.getErrorMessage(error),
      },
    );
  }

  private handleLockedFlushRetryExhausted(
    batch: LogRecord[],
    attempt: number,
    error: unknown,
  ): void {
    const delay = this.computeRetryDelayMs(attempt);
    this.nextFlushNotBefore = Date.now() + delay;
    console.warn(
      "[LogSQLitePersistence] DB locked after retries, keeping batch in queue:",
      {
        batchSize: batch.length,
        retryAttempts: this.maxRetries,
        nextRetryInMs: delay,
        error: this.getErrorMessage(error),
      },
    );
  }

  private async insertBatch(batch: LogRecord[]): Promise<void> {
    const trx = await this.db.transaction();

    try {
      const insertQuery = `
        INSERT INTO ${this.tableName} (id, timestamp, level, message, source, fields)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      for (const record of batch) {
        if (!record.id) {
          record.id = this.generateId();
        }

        const params = [
          record.id,
          record.timestamp,
          record.level,
          typeof record.message === "string"
            ? record.message
            : JSON.stringify(record.message),
          record.source,
          record.fields && Object.keys(record.fields).length > 0
            ? JSON.stringify(record.fields)
            : null,
        ];

        if (params.length !== 6 || params.some((p) => p === undefined)) {
          throw new Error(
            `Invalid parameters: expected 6, got ${params.length}.`,
          );
        }


        await trx.query(insertQuery, params);
      }

      await trx.commit();
      this.totalWritesSinceLastRetention += batch.length;
    } catch (error) {
      try {
        await trx.rollback();
      } catch {
        // ignore rollback errors, original error is more important
      }
      throw error;
    }
  }

  private enqueueRecords(records: LogRecord[]): void {
    if (records.length === 0) {
      return;
    }

    this.writeQueue.push(...records);
    if (this.writeQueue.length <= this.maxQueueSize) {
      return;
    }

    const overflow = this.writeQueue.length - this.maxQueueSize;
    this.writeQueue.splice(0, overflow);
    this.droppedLogs += overflow;
    console.warn("[LogSQLitePersistence] Queue overflow, dropping oldest logs:", {
      dropped: overflow,
      maxQueueSize: this.maxQueueSize,
      droppedLogs: this.droppedLogs,
    });
  }

  private requeueToFront(batch: LogRecord[]): void {
    this.writeQueue = [...batch, ...this.writeQueue];
    if (this.writeQueue.length > this.maxQueueSize) {
      const overflow = this.writeQueue.length - this.maxQueueSize;
      this.writeQueue.splice(this.maxQueueSize, overflow);
      this.droppedLogs += overflow;
      console.warn(
        "[LogSQLitePersistence] Queue overflow after requeue, dropping newest tail logs:",
        {
          dropped: overflow,
          maxQueueSize: this.maxQueueSize,
          droppedLogs: this.droppedLogs,
        },
      );
    }
  }

  private isRetryableLockError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const normalized = msg.toLowerCase();
    return (
      normalized.includes("database is locked") ||
      normalized.includes("database schema is locked") ||
      normalized.includes("sqlite_busy") ||
      normalized.includes("sqlite_locked")
    );
  }

  private isClosedConnectionError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const normalized = msg.toLowerCase();
    return (
      normalized.includes("database is closed") ||
      normalized.includes("database connection is closed") ||
      normalized.includes("connection is closed")
    );
  }

  private isFtsSyntaxError(error: unknown): boolean {
    const msg = this.getErrorMessage(error).toLowerCase();
    return (
      msg.includes("no such column") ||
      msg.includes("fts5: syntax error") ||
      msg.includes("malformed match expression")
    );
  }

  private async rebuildFtsIndex(): Promise<void> {
    if (this.ftsRebuildInProgress) {
      return;
    }
    this.ftsRebuildInProgress = true;
    try {
      await this.db.query(`INSERT INTO logs_fts(logs_fts) VALUES('rebuild')`);
    } catch (error) {
      console.warn("[LogSQLitePersistence] Failed to rebuild FTS index:", error);
    } finally {
      this.ftsRebuildInProgress = false;
    }
  }

  private computeRetryDelayMs(attempt: number): number {
    const exp = this.retryBaseDelayMs * 2 ** Math.max(0, attempt);
    const capped = Math.min(exp, this.retryMaxDelayMs);
    const jitter = Math.floor(Math.random() * Math.min(50, Math.max(1, capped / 4)));
    return capped + jitter;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Start auto-flush timer.
   * @private
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((error) => {
        console.error(
          "[LogSQLitePersistence] Failed to flush log queue:",
          error,
        );
      });
    }, this.flushInterval);

    // Don't keep process alive for flush timer
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  /**
   * Start periodic retention cleanup timer.
   * Runs cleanup at configured interval to enforce retention policies.
   * @private
   */
  private startRetentionTimer(): void {
    // Run first cleanup after a short delay (don't block startup)
    const initialDelay = Math.min(this.retentionCleanupIntervalMs, 10_000);
    const initialTimer = setTimeout(() => {
      this.runRetention().catch((error) => {
        console.error(
          "[LogSQLitePersistence] Retention cleanup failed:",
          error,
        );
      });
    }, initialDelay);
    if (initialTimer.unref) {
      initialTimer.unref();
    }

    this.retentionTimer = setInterval(() => {
      this.runRetention().catch((error) => {
        console.error(
          "[LogSQLitePersistence] Retention cleanup failed:",
          error,
        );
      });
    }, this.retentionCleanupIntervalMs);

    if (this.retentionTimer.unref) {
      this.retentionTimer.unref();
    }
  }

  /**
   * Run retention cleanup: delete expired logs by level, then enforce size limit.
   *
   * I/O optimization:
   * - Skips TTL cleanup only when: no writes AND last cleanup deleted nothing
   *   (meaning DB is already clean — no stale rows remain)
   * - Uses a single combined DELETE with OR instead of 3 separate queries
   * - Size check runs only every N cycles (not every time)
   * @private
   */
  private async runRetention(): Promise<void> {
    if (this.shuttingDown || this.closed) {
      return;
    }

    this.retentionCycleCount++;
    const hadWrites = this.totalWritesSinceLastRetention > 0;
    this.totalWritesSinceLastRetention = 0;

    // Run TTL cleanup when there are new writes OR when previous run deleted rows
    // (stale data may still remain). Skip only when DB is confirmed clean.
    const shouldRunTTL = hadWrites || this.lastRetentionDeletedAny;

    const shouldCheckSize =
      this.retentionMaxSizeBytes > 0 &&
      this.retentionCycleCount % SIZE_CHECK_EVERY_N_CYCLES === 0;

    if (!shouldRunTTL && !shouldCheckSize) {
      return;
    }

    try {
      let totalDeleted = 0;

      // Time-based cleanup: single query with OR conditions
      if (shouldRunTTL) {
        const deleted = await this.deleteExpiredLogs();
        totalDeleted += deleted;
        this.lastRetentionDeletedAny = deleted > 0;
      }

      // Size-based cleanup: expensive, runs infrequently
      if (shouldCheckSize) {
        const sizeDeleted = await this.enforceSizeLimit();
        totalDeleted += sizeDeleted;
      }

      if (totalDeleted > 0) {
        console.log(
          `[LogSQLitePersistence] Retention cleanup: deleted ${totalDeleted} logs`,
        );
      }
    } catch (error) {
      // Don't let retention errors crash the process
      if (!this.isClosedConnectionError(error)) {
        console.error(
          "[LogSQLitePersistence] Retention cleanup error:",
          this.getErrorMessage(error),
        );
      }
    }
  }

  /**
   * Delete expired logs using a single combined query.
   * Combines all level-based TTLs into one DELETE statement to minimize I/O.
   * @private
   */
  private async deleteExpiredLogs(): Promise<number> {
    const now = Date.now();
    const conditions: string[] = [];
    const params: unknown[] = [];

    // debug/trace TTL
    if (this.retentionMaxAgeDebug > 0) {
      const cutoff = now - this.retentionMaxAgeDebug;
      conditions.push(`(level IN ('debug', 'trace') AND timestamp < ?)`);
      params.push(cutoff);
    }

    // info TTL
    if (this.retentionMaxAgeInfo > 0) {
      const cutoff = now - this.retentionMaxAgeInfo;
      conditions.push(`(level = 'info' AND timestamp < ?)`);
      params.push(cutoff);
    }

    // warn/error/fatal TTL
    if (this.retentionMaxAge > 0) {
      const cutoff = now - this.retentionMaxAge;
      conditions.push(`(level IN ('warn', 'error', 'fatal') AND timestamp < ?)`);
      params.push(cutoff);
    }

    if (conditions.length === 0) {
      return 0;
    }

    const query = `DELETE FROM ${this.tableName} WHERE ${conditions.join(" OR ")}`;
    const result = await this.db.query(query, params);
    return result.rowCount ?? 0;
  }

  /**
   * Delete oldest logs in batches until DB size is under maxSizeBytes.
   * @private
   */
  private async enforceSizeLimit(): Promise<number> {
    let totalDeleted = 0;
    let iterations = 0;
    const maxIterations = 100; // Safety valve

    while (iterations < maxIterations) {
      iterations++;
      const stats = await this.getStats();
      if (stats.sizeBytes <= this.retentionMaxSizeBytes) {
        break;
      }
      if (stats.totalLogs === 0) {
        break;
      }

      // Delete oldest batch
      const oldestQuery = `
        SELECT MAX(timestamp) as cutoff FROM (
          SELECT timestamp FROM ${this.tableName}
          ORDER BY timestamp ASC
          LIMIT ${SIZE_CLEANUP_BATCH}
        )
      `;
      const cutoffResult = await this.db.query<{ cutoff: number | null }>(oldestQuery);
      const cutoff = cutoffResult.rows[0]?.cutoff;
      if (cutoff == null) {
        break;
      }

      const deleted = await this.deleteOlderThan(cutoff + 1);
      totalDeleted += deleted;
      if (deleted === 0) {
        break;
      }
    }

    // VACUUM if we deleted a significant amount
    if (totalDeleted > SIZE_CLEANUP_BATCH) {
      try {
        await this.db.query("VACUUM");
      } catch {
        // VACUUM can fail if DB is locked by another connection — not critical
      }
    }

    return totalDeleted;
  }

  /**
   * Check if a log level should be skipped (not persisted).
   * Debug/trace are skipped when maxAgeDebug is 0.
   * @private
   */
  private shouldSkipLevel(level: string): boolean {
    if (this.retentionMaxAgeDebug === 0 && DEBUG_LEVELS.includes(level)) {
      return true;
    }
    if (this.retentionMaxAgeInfo === 0 && INFO_LEVELS.includes(level)) {
      return true;
    }
    return false;
  }

  /**
   * Generate unique log ID using ULID from core-platform.
   * Delegates to generateLogId() for consistency across all adapters.
   * @private
   */
  private generateId(): string {
    return generateLogId();
  }
}

/**
 * Dependencies for SQLite log persistence adapter.
 * Matches manifest.requires.adapters: [{ id: 'db', alias: 'database' }]
 */
export interface LogPersistenceDeps {
  database: ISQLDatabase;
}

/**
 * Factory function for creating SQLite log persistence adapter.
 * This is the function called by platform initialization.
 *
 * @param config - Persistence configuration (can be empty, database comes from deps)
 * @param deps - Required dependencies (database)
 * @returns Initialized persistence adapter
 */
export async function createAdapter(
  config: Omit<LogPersistenceConfig, "database">,
  deps: LogPersistenceDeps,
): Promise<LogSQLitePersistence> {
  const fullConfig: LogPersistenceConfig = {
    ...config,
    database: deps.database,
  };
  const adapter = new LogSQLitePersistence(fullConfig);
  await adapter.initialize();
  return adapter;
}

// Default export for convenience
export default createAdapter;
