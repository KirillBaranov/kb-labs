/**
 * @module @kb-labs/adapters-sqlite
 * SQLite adapter implementing ISQLDatabase interface.
 *
 * Features:
 * - Based on better-sqlite3 (synchronous API)
 * - Connection pooling (single connection, thread-safe)
 * - Transaction support with rollback
 * - Prepared statement caching
 * - Type-safe query results
 *
 * @example
 * ```typescript
 * import { createAdapter } from '@kb-labs/adapters-sqlite';
 *
 * const db = createAdapter({
 *   filename: '/var/data/app.db',
 *   readonly: false,
 * });
 *
 * // Execute query
 * const result = await db.query('SELECT * FROM users WHERE id = ?', [123]);
 * console.log(result.rows); // [{ id: 123, name: 'Alice' }]
 *
 * // Transaction
 * await db.transaction(async (trx) => {
 *   await trx.query('INSERT INTO users (name) VALUES (?)', ['Bob']);
 *   await trx.query('INSERT INTO logs (action) VALUES (?)', ['user_created']);
 * });
 *
 * // Close connection
 * await db.close();
 * ```
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import type {
  ISQLDatabase,
  IDisposable,
  SQLQueryResult,
  SQLTransaction,
} from "@kb-labs/core-platform/adapters";


// Re-export manifest
export { manifest } from "./manifest.js";

/**
 * Configuration for SQLite database adapter.
 */
export interface SQLiteConfig {
  /**
   * Database file path.
   * Use ':memory:' for in-memory database (useful for testing).
   * Relative paths are resolved against workspace.cwd (injected by core-runtime).
   */
  filename: string;

  /**
   * Workspace context injected by core-runtime.
   * Provides cwd for resolving relative filename paths.
   */
  workspace?: { cwd: string };

  /**
   * Open in readonly mode (default: false)
   */
  readonly?: boolean;

  /**
   * Enable WAL mode for better concurrency (default: true)
   * https://www.sqlite.org/wal.html
   */
  wal?: boolean;

  /**
   * Enable foreign keys (default: true)
   */
  foreignKeys?: boolean;

  /**
   * Busy timeout in milliseconds (default: 5000)
   */
  busyTimeout?: number;
}

/**
 * SQLite implementation of ISQLDatabase interface.
 *
 * Design:
 * - Uses better-sqlite3 (synchronous, but wrapped in async for interface compatibility)
 * - Single connection (thread-safe via better-sqlite3)
 * - Prepared statement caching (automatic via better-sqlite3)
 * - Transaction support with savepoints
 */
export class SQLiteAdapter implements ISQLDatabase, IDisposable {
  private db: Database.Database;
  private closed = false;
  /** Stored so we can deregister it in dispose() — prevents listener accumulation. */
  private _onExit: (() => void) | null = null;
  /** True for ':memory:' databases — skip WAL ops and exit-handler registration. */
  private _isMemory = false;


  constructor(config: SQLiteConfig) {
    // Resolve relative filename against workspace root (injected by core-runtime)
    const cwd = config.workspace?.cwd ?? process.cwd();
    const resolvedFilename =
      config.filename === ":memory:" || isAbsolute(config.filename)
        ? config.filename
        : join(cwd, config.filename);

    // Create parent directory if it doesn't exist (unless :memory:)
    if (resolvedFilename !== ":memory:" && !config.readonly) {
      const dir = dirname(resolvedFilename);
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedFilename, {
      readonly: config.readonly ?? false,
      fileMustExist: false, // Create if not exists
    });

    // Set busy timeout
    this.db.pragma(`busy_timeout = ${config.busyTimeout ?? 5000}`);

    // Enable WAL mode for better concurrency
    if (config.wal !== false) {
      this.db.pragma("journal_mode = WAL");
    }

    // Enable foreign keys
    if (config.foreignKeys !== false) {
      this.db.pragma("foreign_keys = ON");
    }

    // ── Exit handler registration ───────────────────────────────────────────
    // Register a synchronous exit handler only for file-backed, writable, WAL-mode databases.
    //
    // WHY: If the process exits abruptly (SIGTERM, SIGKILL, unhandled rejection) without
    // explicitly calling dispose() or close(), the WAL file may contain unflushed frames.
    // The next process opening the database will perform WAL recovery, which is safe but
    // slow. An explicit TRUNCATE checkpoint moves all WAL frames into the main database
    // file and empties the WAL, making re-open instantaneous.
    //
    // WHY SYNC: process.on('exit') callbacks must be synchronous — async code scheduled
    // after the event loop drains is silently dropped by Node.js. better-sqlite3 is
    // natively synchronous so this is correct and efficient.
    //
    // WHY NOT :memory:: In-memory databases have no WAL file on disk; there is nothing
    // to checkpoint and nothing to persist. Registering a process listener for them would
    // be a no-op at best and a source of listener-count warnings at worst.
    this._isMemory = resolvedFilename === ":memory:";
    if (!this._isMemory && !config.readonly && config.wal !== false) {
      this._onExit = () => { this.dispose(); };
      process.on("exit", this._onExit);
    }
  }


  /**
   * Execute a SQL query.
   *
   * @param sql - SQL query string (supports ? placeholders)
   * @param params - Query parameters
   * @returns Query result with rows and metadata
   */
  async query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<SQLQueryResult<T>> {
    this.checkClosed();

    try {
      const trimmedSql = sql.trim().toUpperCase();

      // SELECT queries
      if (trimmedSql.startsWith("SELECT") || trimmedSql.startsWith("PRAGMA")) {
        const stmt = this.db.prepare(sql);
        const rows = params ? stmt.all(...params) : stmt.all();

        return {
          rows: rows as T[],
          rowCount: rows.length,
          fields: this.getFieldMetadata(stmt),
        };
      }

      // INSERT/UPDATE/DELETE queries
      const stmt = this.db.prepare(sql);
      const info = params ? stmt.run(...params) : stmt.run();

      return {
        rows: [] as T[],
        rowCount: info.changes,
        fields: [],
      };
    } catch (error) {
      throw new Error(
        `SQLite query failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Begin a SQL transaction.
   *
   * @returns Transaction object with query, commit, rollback methods
   */
  async transaction(): Promise<SQLTransaction> {
    this.checkClosed();

    // SQLite doesn't have true async transactions, but we use savepoint
    await this.query("BEGIN TRANSACTION", []);

    let committed = false;
    let rolledBack = false;

    return {
      query: async <T = unknown>(
        sql: string,
        params?: unknown[],
      ): Promise<SQLQueryResult<T>> => {
        if (committed || rolledBack) {
          throw new Error("Transaction already completed");
        }
        return this.query<T>(sql, params);
      },

      commit: async (): Promise<void> => {
        if (committed || rolledBack) {
          throw new Error("Transaction already completed");
        }
        await this.query("COMMIT", []);
        committed = true;
      },

      rollback: async (): Promise<void> => {
        if (committed || rolledBack) {
          throw new Error("Transaction already completed");
        }
        await this.query("ROLLBACK", []);
        rolledBack = true;
      },
    };
  }

  /**
   * Checkpoint WAL and close the database connection. Implements IDisposable.
   *
   * Synchronous by design — process.on('exit') callbacks that are async are
   * silently dropped by Node.js after the event loop drains. better-sqlite3
   * is natively synchronous so sync disposal is both correct and sufficient.
   *
   * Idempotent: subsequent calls after the first are no-ops (guarded by this.closed).
   *
   * Sequence:
   *   1. Set this.closed = true immediately to block new queries.
   *   2. Deregister the 'exit' listener (prevents double-dispose on graceful shutdown
   *      followed by normal process exit — both paths are safe but one is enough).
   *   3. Checkpoint WAL into the main DB file and truncate the WAL to zero bytes
   *      (TRUNCATE mode — fastest and most space-efficient).
   *   4. Close the better-sqlite3 connection.
   */
  dispose(): void {
    if (this.closed) {return;}
    this.closed = true;

    // Deregister exit listener — prevents a second dispose() call when graceful
    // shutdown (SIGTERM → platform.shutdown() → dispose()) is followed by process.exit(0).
    if (this._onExit !== null) {
      process.removeListener("exit", this._onExit);
      this._onExit = null;
    }

    try {
      // Checkpoint WAL: flush all WAL frames into the main database file and
      // truncate the WAL to 0 bytes. Skipped for :memory: (no WAL file) and
      // readonly connections (cannot write checkpoint).
      if (!this._isMemory && !this.db.readonly) {
        this.db.pragma("wal_checkpoint(TRUNCATE)");
      }
      this.db.close();
    } catch {
      // Already closed or I/O error at exit time — nothing we can do.
      // Swallow silently: throwing from a dispose() called during process.exit
      // would print an uncaught exception without actually halting anything useful.
    }
  }

  /**
   * Implements ISQLDatabase.close() — delegates to dispose() for WAL checkpoint.
   *
   * PlatformContainer.shutdown() checks for close() before dispose() (container.ts line 830),
   * so this path is taken when the container disposes this adapter. Delegating to dispose()
   * ensures WAL checkpoint happens regardless of which method is called.
   */
  async close(): Promise<void> {
    this.dispose();
  }


  /**
   * Check if database is closed.
   */
  private checkClosed(): void {
    if (this.closed) {
      throw new Error("Database is closed");
    }
  }

  /**
   * Extract field metadata from prepared statement.
   */
  private getFieldMetadata(
    stmt: Database.Statement,
  ): Array<{ name: string; type: string }> {
    try {
      // better-sqlite3 provides column info
      return stmt.columns().map((col) => ({
        name: col.name,
        type: col.type ?? "unknown",
      }));
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Utility methods (not part of ISQLDatabase interface)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute raw SQL (useful for schema migrations).
   * Does not return rows - use query() for SELECT.
   */
  async exec(sql: string): Promise<void> {
    this.checkClosed();
    this.db.exec(sql);
  }

  /**
   * Check if database is open.
   */
  isOpen(): boolean {
    return !this.closed;
  }

  /**
   * Get underlying better-sqlite3 instance (for advanced usage).
   * Use with caution - bypasses adapter interface.
   */
  getRawDatabase(): Database.Database {
    this.checkClosed();
    return this.db;
  }
}

/**
 * Create SQLite database adapter.
 * This is the factory function called by initPlatform() when loading adapters.
 *
 * @param config - SQLite configuration
 * @returns SQLite adapter instance
 *
 * @example
 * ```typescript
 * const db = createAdapter({
 *   filename: '/var/data/app.db',
 *   wal: true,
 *   foreignKeys: true,
 * });
 * ```
 */
export function createAdapter(config: SQLiteConfig): SQLiteAdapter {
  return new SQLiteAdapter(config);
}

// Default export for direct import
export default createAdapter;
