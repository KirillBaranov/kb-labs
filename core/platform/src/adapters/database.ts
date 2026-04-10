/**
 * @module @kb-labs/core-platform/adapters/database
 * Database abstraction for SQL, Document, KV, and TimeSeries databases.
 *
 * Design principles:
 * - Unified interface across SQL, NoSQL, KV, TimeSeries
 * - Permission-aware (checked at runtime)
 * - Backend-agnostic (SQLite, Postgres, Mongo, Redis, etc.)
 */

// ============================================================================
// SQL DATABASE
// ============================================================================

/**
 * Result of a SQL query execution.
 */
export interface SQLQueryResult<T = unknown> {
  /** Rows returned by SELECT queries */
  rows: T[];
  /** Number of rows affected by INSERT/UPDATE/DELETE */
  rowCount: number;
  /** Column metadata (names, types) */
  fields?: Array<{ name: string; type: string }>;
}

/**
 * SQL transaction interface.
 * Supports ACID transactions with explicit commit/rollback.
 */
export interface SQLTransaction {
  /**
   * Execute a SQL query within the transaction.
   * @param sql - SQL query string
   * @param params - Query parameters (prevents SQL injection)
   * @returns Query result
   */
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<SQLQueryResult<T>>;

  /**
   * Commit the transaction.
   * All changes are persisted to the database.
   */
  commit(): Promise<void>;

  /**
   * Rollback the transaction.
   * All changes are discarded.
   */
  rollback(): Promise<void>;
}

/**
 * SQL database adapter interface.
 *
 * **Security model:**
 * - Permission enforcement happens at runtime (SecureSQLDatabase wrapper)
 * - SQL parsing extracts table names for permission checks
 * - Validation-only approach (no query rewriting)
 *
 * **Implementations:**
 * - `@kb-labs/adapters-db-sqlite` - SQLite (file-based, embedded)
 * - `@kb-labs/adapters-db-postgres` - PostgreSQL (network)
 * - `NoOpSQLDatabase` - No-op adapter for testing
 */
export interface ISQLDatabase {
  /**
   * Execute a SQL query.
   *
   * @param sql - SQL query string (SELECT, INSERT, UPDATE, DELETE, etc.)
   * @param params - Query parameters (prevents SQL injection)
   * @returns Query result
   *
   * **Security:**
   * - Runtime permission check: extracts table names from SQL
   * - Validates against `permissions.platform.database.sql.tables`
   * - Throws PermissionError if access denied
   *
   * @example
   * ```typescript
   * const result = await db.query<{ id: number; name: string }>(
   *   'SELECT id, name FROM users WHERE age > ?',
   *   [18]
   * );
   * console.log(result.rows); // [{ id: 1, name: 'Alice' }, ...]
   * ```
   */
  query<T = unknown>(
    sql: string,
    params?: unknown[],
  ): Promise<SQLQueryResult<T>>;

  /**
   * Begin a SQL transaction.
   *
   * @returns Transaction object
   *
   * **Usage:**
   * ```typescript
   * const tx = await db.transaction();
   * try {
   *   await tx.query('INSERT INTO users (name) VALUES (?)', ['Alice']);
   *   await tx.query('INSERT INTO audit_log (action) VALUES (?)', ['user_created']);
   *   await tx.commit();
   * } catch (err) {
   *   await tx.rollback();
   *   throw err;
   * }
   * ```
   */
  transaction(): Promise<SQLTransaction>;

  /**
   * Close database connection.
   * Should be called on shutdown.
   */
  close(): Promise<void>;

  /**
   * Execute raw SQL (for schema migrations).
   * Optional utility method - not all database adapters may support this.
   * Better-sqlite3's exec() handles multiple statements separated by semicolons.
   *
   * @param sql - Raw SQL string (may contain multiple statements)
   */
  exec?(sql: string): Promise<void>;
}

// ============================================================================
// DOCUMENT DATABASE
// ============================================================================

/**
 * Base document type - all documents must have id, createdAt, updatedAt.
 */
export interface BaseDocument {
  id: string;
  createdAt: number; // Unix timestamp (milliseconds)
  updatedAt: number; // Unix timestamp (milliseconds)
}

/**
 * MongoDB-style query operators.
 */
export interface FilterOperators<T> {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $exists?: boolean;
  $regex?: string;
}

/**
 * Document filter - MongoDB-style query syntax.
 */
export type DocumentFilter<T> = {
  [K in keyof T]?: T[K] | FilterOperators<T[K]>;
} & {
  $and?: DocumentFilter<T>[];
  $or?: DocumentFilter<T>[];
};

/**
 * MongoDB-style update operators.
 */
export interface DocumentUpdate<T> {
  $set?: Partial<T>;
  $unset?: { [K in keyof T]?: 1 };
  $inc?: { [K in keyof T]?: number };
  $push?: { [K in keyof T]?: unknown };
  $pull?: { [K in keyof T]?: unknown };
}

/**
 * Find options (sort, limit, skip).
 */
export interface FindOptions {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

/**
 * Document database adapter interface.
 *
 * **Security model:**
 * - Permission enforcement happens at runtime (SecureDocumentDatabase wrapper)
 * - Validates collection access against `permissions.platform.database.document.collections`
 *
 * **Implementations:**
 * - `@kb-labs/adapters-db-mongo` - MongoDB
 * - `NoOpDocumentDatabase` - No-op adapter for testing
 */
export interface IDocumentDatabase {
  /**
   * Find documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @param options - Sort, limit, skip
   * @returns Array of matching documents
   */
  find<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions,
  ): Promise<T[]>;

  /**
   * Find a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @returns Document or null if not found
   */
  findById<T extends BaseDocument>(
    collection: string,
    id: string,
  ): Promise<T | null>;

  /**
   * Insert a single document.
   *
   * @param collection - Collection name
   * @param document - Document to insert (id, createdAt, updatedAt will be added if missing)
   * @returns Inserted document with generated fields
   */
  insertOne<T extends BaseDocument>(
    collection: string,
    document: Omit<T, "id" | "createdAt" | "updatedAt">,
  ): Promise<T>;

  /**
   * Update documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @param update - MongoDB-style update operators ($set, $inc, etc.)
   * @returns Number of documents updated
   */
  updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
  ): Promise<number>;

  /**
   * Update a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @param update - MongoDB-style update operators
   * @returns Updated document or null if not found
   */
  updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
  ): Promise<T | null>;

  /**
   * Delete documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @returns Number of documents deleted
   */
  deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number>;

  /**
   * Delete a single document by ID.
   *
   * @param collection - Collection name
   * @param id - Document ID
   * @returns True if deleted, false if not found
   */
  deleteById(collection: string, id: string): Promise<boolean>;

  /**
   * Count documents matching a filter.
   *
   * @param collection - Collection name
   * @param filter - MongoDB-style filter
   * @returns Number of matching documents
   */
  count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number>;

  /**
   * Close database connection.
   */
  close(): Promise<void>;
}

// ============================================================================
// KEY-VALUE DATABASE
// ============================================================================

/**
 * Key-value database adapter interface.
 *
 * **Security model:**
 * - Permission enforcement happens at runtime
 * - Validates key prefix access against `permissions.platform.database.kv.prefixes`
 *
 * **Implementations:**
 * - `@kb-labs/adapters-db-redis` - Redis
 * - `NoOpKVDatabase` - No-op adapter for testing
 */
export interface IKeyValueDatabase {
  /**
   * Get value by key.
   *
   * @param key - Key to retrieve
   * @returns Value or null if not found
   */
  get(key: string): Promise<string | null>;

  /**
   * Set value for key.
   *
   * @param key - Key to set
   * @param value - Value to store
   * @param ttlMs - Optional TTL in milliseconds
   */
  set(key: string, value: string, ttlMs?: number): Promise<void>;

  /**
   * Delete key.
   *
   * @param key - Key to delete
   * @returns True if deleted, false if not found
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if key exists.
   *
   * @param key - Key to check
   * @returns True if exists, false otherwise
   */
  exists(key: string): Promise<boolean>;

  /**
   * List keys matching a pattern.
   *
   * @param pattern - Glob pattern (e.g., 'user:*')
   * @returns Array of matching keys
   */
  keys(pattern: string): Promise<string[]>;

  /**
   * Close database connection.
   */
  close(): Promise<void>;
}

// ============================================================================
// TIME-SERIES DATABASE
// ============================================================================

/**
 * Time-series data point.
 */
export interface TimeSeriesPoint {
  /** Timestamp (Unix milliseconds) */
  timestamp: number;
  /** Metric value */
  value: number;
  /** Optional tags/labels */
  tags?: Record<string, string>;
}

/**
 * Time-series database adapter interface.
 *
 * **Security model:**
 * - Permission enforcement happens at runtime
 * - Validates metric access against `permissions.platform.database.timeseries.metrics`
 *
 * **Implementations:**
 * - `@kb-labs/adapters-db-timescale` - TimescaleDB (PostgreSQL extension)
 * - `NoOpTimeSeriesDatabase` - No-op adapter for testing
 */
export interface ITimeSeriesDatabase {
  /**
   * Write a single data point.
   *
   * @param metric - Metric name (e.g., 'cpu_usage')
   * @param point - Data point
   */
  write(metric: string, point: TimeSeriesPoint): Promise<void>;

  /**
   * Write multiple data points (batch).
   *
   * @param metric - Metric name
   * @param points - Array of data points
   */
  writeBatch(metric: string, points: TimeSeriesPoint[]): Promise<void>;

  /**
   * Query time-series data.
   *
   * @param metric - Metric name
   * @param startTime - Start timestamp (Unix milliseconds)
   * @param endTime - End timestamp (Unix milliseconds)
   * @param tags - Optional tag filters
   * @returns Array of data points
   */
  query(
    metric: string,
    startTime: number,
    endTime: number,
    tags?: Record<string, string>,
  ): Promise<TimeSeriesPoint[]>;

  /**
   * Close database connection.
   */
  close(): Promise<void>;
}

// ============================================================================
// DATABASE PROVIDER (UNIFIED ENTRY POINT)
// ============================================================================

/**
 * Database provider interface.
 * Provides access to different database types (SQL, Document, KV, TimeSeries).
 *
 * **Usage:**
 * ```typescript
 * const provider = runtime.platform.database;
 *
 * // SQL
 * const sql = await provider.getSQLDatabase('main');
 * const users = await sql.query('SELECT * FROM users WHERE active = ?', [true]);
 *
 * // Document
 * const doc = await provider.getDocumentDatabase('main');
 * const posts = await doc.find('posts', { status: 'published' });
 *
 * // KV
 * const kv = await provider.getKeyValueDatabase('cache');
 * await kv.set('session:123', JSON.stringify(session), 3600000);
 *
 * // TimeSeries
 * const ts = await provider.getTimeSeriesDatabase('metrics');
 * await ts.write('api_latency', { timestamp: Date.now(), value: 42 });
 * ```
 */
export interface IDatabaseProvider {
  /**
   * Get SQL database instance.
   *
   * @param name - Database name (from config)
   * @returns SQL database adapter
   * @throws Error if database not configured
   */
  getSQLDatabase(name: string): Promise<ISQLDatabase>;

  /**
   * Get document database instance.
   *
   * @param name - Database name (from config)
   * @returns Document database adapter
   * @throws Error if database not configured
   */
  getDocumentDatabase(name: string): Promise<IDocumentDatabase>;

  /**
   * Get key-value database instance.
   *
   * @param name - Database name (from config)
   * @returns KV database adapter
   * @throws Error if database not configured
   */
  getKeyValueDatabase(name: string): Promise<IKeyValueDatabase>;

  /**
   * Get time-series database instance.
   *
   * @param name - Database name (from config)
   * @returns TimeSeries database adapter
   * @throws Error if database not configured
   */
  getTimeSeriesDatabase(name: string): Promise<ITimeSeriesDatabase>;

  /**
   * Close all database connections.
   */
  close(): Promise<void>;
}
