/**
 * @module @kb-labs/core-platform/adapters/database
 * Storage abstractions for KB Labs plugins.
 *
 * Two contracts, both backend-agnostic with identical semantics across drivers:
 * - `IDocumentDatabase` — structured CRUD with filters, transactions, indexes.
 * - `IKVStore` — durable key-value with TTL, CAS, atomic counters, prefix scans.
 *
 * Design rules:
 * - A plugin MUST be able to swap the underlying driver (sqlite ↔ postgres ↔ mongo)
 *   without code changes. Anything with diverging semantics across drivers is NOT in
 *   the contract. No runtime `supports()` API — capability requirements are declared
 *   in the plugin manifest and validated at install time.
 * - Namespacing is mandatory: each plugin sees only its own collections / keys.
 *   The platform wraps the raw adapter so that cross-namespace access is impossible.
 *
 * For analytics / aggregation workloads use `IAnalytics` (separate abstraction).
 * For binary blobs use `IStorage`.
 */

// ============================================================================
// Shared
// ============================================================================

/**
 * Options accepted by every method that performs I/O. Lets callers cancel
 * in-flight operations (e.g. when an upstream HTTP client disconnects).
 *
 * Cancellation is best-effort: the driver aborts the operation if it can.
 * Drivers that are inherently synchronous (better-sqlite3) may treat the signal
 * as advisory and let the current operation finish before checking it.
 */
export interface SignalOpts {
  signal?: AbortSignal;
}

// ============================================================================
// Document database
// ============================================================================

/**
 * Base document — every document has these three system fields.
 * `id` is assigned by the driver on insert (ULID/UUID).
 * `createdAt` / `updatedAt` are Unix milliseconds.
 */
export interface BaseDocument {
  id: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Comparison operators usable on any scalar field.
 * Semantics are identical across drivers.
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
  /** Substring match, case-sensitive. */
  $startsWith?: T extends string ? string : never;
  /** Substring match, case-sensitive. */
  $contains?: T extends string ? string : never;
  /** Substring match, case-sensitive. */
  $endsWith?: T extends string ? string : never;
}

/**
 * Filter expression.
 *
 * For each field of the document either a scalar (implies `$eq`) or an operators object.
 * Use `$and` / `$or` for boolean composition.
 *
 * Removed from the contract because semantics diverge across drivers:
 * - `$regex` (PCRE vs POSIX),
 * - array operators (`$push`, `$pull` with filter),
 * - aggregation pipeline,
 * - text search,
 * - joins (`$lookup`).
 */
export type DocumentFilter<T> = {
  [K in keyof T]?: T[K] | FilterOperators<T[K]>;
} & {
  $and?: DocumentFilter<T>[];
  $or?: DocumentFilter<T>[];
};

/**
 * Update operators. Three primitives, all with identical cross-driver semantics:
 * - `$set` overwrites the listed fields,
 * - `$unset` removes the listed fields,
 * - `$inc` atomically increments numeric fields (driver guarantees atomicity
 *    within a transaction; outside a transaction the increment is still
 *    atomic w.r.t. concurrent updates to the same document).
 */
export interface DocumentUpdate<T> {
  $set?: Partial<T>;
  $unset?: { [K in keyof T]?: 1 };
  $inc?: { [K in keyof T]?: number };
}

/**
 * Result of a single operation inside a `bulkWrite`.
 */
export type BulkOp<T extends BaseDocument = BaseDocument> =
  | { type: 'insert'; doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'update'; filter: DocumentFilter<T>; update: DocumentUpdate<T>; upsert?: boolean }
  | { type: 'delete'; filter: DocumentFilter<T> };

export interface BulkResult {
  inserted: number;
  updated: number;
  deleted: number;
}

/**
 * Projection — request a subset of fields. Reduces payload size for large documents.
 *
 * Format: `{ field: 1 }` to include, `{ field: 0 }` to exclude. Cannot mix.
 */
export type Projection<T> = { [K in keyof T]?: 0 | 1 };

export interface FindOptions {
  sort?: Record<string, 1 | -1>;
  limit?: number;
  skip?: number;
}

export interface ProjectOpts<T, P> {
  project?: Projection<T> | (P extends T ? never : Projection<T>);
}

/**
 * Index specification for `ensureCollection`.
 *
 * - `path` — dotted path or composite array of dotted paths.
 * - `unique` — second insert violating the index throws.
 * - `sparse` — index entries skipped for docs missing the field.
 * - `ttl` — only valid on a timestamp/date field. Documents become invisible
 *    once their field value + `ttl` ms is in the past.
 */
export interface IndexSpec {
  path: string | string[];
  unique?: boolean;
  sparse?: boolean;
  /** TTL in milliseconds, applied to the timestamp value of `path`. */
  ttl?: number;
}

export interface EnsureCollectionOpts {
  indexes?: IndexSpec[];
}

/**
 * Callback handle for a document-level transaction.
 *
 * All operations within the callback execute atomically. Throwing from the
 * callback rolls the transaction back. Returning a value commits and forwards
 * the value to the outer caller.
 *
 * Transactions never cross plugin namespaces — the wrapper rejects any attempt
 * to touch a collection outside the caller's namespace.
 */
export interface IDocumentTransaction {
  find<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
  ): Promise<P[]>;

  findById<T extends BaseDocument>(
    collection: string,
    id: string,
    options?: SignalOpts,
  ): Promise<T | null>;

  count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number>;

  insertOne<T extends BaseDocument>(
    collection: string,
    doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
    options?: SignalOpts,
  ): Promise<T>;

  insertMany<T extends BaseDocument>(
    collection: string,
    docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
    options?: SignalOpts,
  ): Promise<T[]>;

  updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts & { upsert?: boolean },
  ): Promise<T | null>;

  updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<number>;

  updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<T | null>;

  deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number>;

  deleteById(
    collection: string,
    id: string,
    options?: SignalOpts,
  ): Promise<boolean>;
}

/**
 * Document database contract — structured CRUD with portable semantics.
 *
 * Implementations live in adapter packages and are registered as the
 * `documentDatabase` platform service. Plugins receive a namespaced view
 * through `platform.documentDatabase`.
 *
 * The shape was hardened against backend leakage: every method here MUST
 * behave identically on every driver (sqlite-JSONB, postgres-JSONB, mongodb).
 * Any operator or method whose semantics diverged across drivers (regex,
 * array operators with filter, aggregation pipeline, change streams,
 * full-text search, schema validators, joins) is intentionally excluded.
 *
 * Implementations:
 * - `@kb-labs/adapters-sqlite` — sqlite-backed (dev / single-node prod)
 * - `@kb-labs/adapters-mongodb` — MongoDB driver
 * - `@kb-labs/adapters-postgres` — Postgres driver (planned)
 * - `NoOpDocumentDatabase` — throws on use, for unconfigured environments
 */
export interface IDocumentDatabase {
  /**
   * Query documents matching a filter. Returns the full document by default;
   * pass `project` to reduce the payload.
   */
  find<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
  ): Promise<P[]>;

  /**
   * Stream matching documents. The async iterator drains the driver cursor in
   * batches of `batchSize` (default driver-specific, typically 100–1000).
   *
   * Use this for result sets that may exceed available memory.
   */
  findStream<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts & { batchSize?: number },
  ): AsyncIterable<P>;

  findById<T extends BaseDocument>(
    collection: string,
    id: string,
    options?: SignalOpts,
  ): Promise<T | null>;

  count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number>;

  /**
   * Insert one document. `id`, `createdAt`, `updatedAt` are populated by the
   * driver and the resulting document is returned.
   */
  insertOne<T extends BaseDocument>(
    collection: string,
    doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
    options?: SignalOpts,
  ): Promise<T>;

  /**
   * Insert many documents atomically. Either all succeed or none (driver runs
   * the batch inside a transaction).
   */
  insertMany<T extends BaseDocument>(
    collection: string,
    docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
    options?: SignalOpts,
  ): Promise<T[]>;

  /**
   * Update the first document matching `filter`. With `upsert: true` creates
   * the document if no match exists; the resulting document is returned.
   *
   * Returns `null` only when nothing matched and `upsert` was not requested.
   */
  updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts & { upsert?: boolean },
  ): Promise<T | null>;

  updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<number>;

  updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<T | null>;

  deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number>;

  deleteById(
    collection: string,
    id: string,
    options?: SignalOpts,
  ): Promise<boolean>;

  /**
   * Atomic batch of mixed insert/update/delete operations.
   *
   * Operations run inside a single transaction — either all succeed or none.
   * There is no "best-effort" mode: drivers that natively expose one (mongo's
   * `ordered: false`) are wrapped to ignore it. Callers that need
   * partial-success semantics do a plain loop themselves.
   */
  bulkWrite<T extends BaseDocument>(
    collection: string,
    ops: Array<BulkOp<T>>,
    options?: SignalOpts,
  ): Promise<BulkResult>;

  /**
   * Run `fn` inside a transaction. If `fn` throws, the transaction rolls back
   * and the error propagates. If it returns, the transaction commits and the
   * value is forwarded.
   *
   * The transaction is scoped to the calling plugin's namespace — touching a
   * collection outside it throws.
   *
   * On drivers that require deployment-time setup for transactions (MongoDB
   * requires a replica set), the driver throws on `transaction()` if the
   * deployment cannot honour it. This is a deployment error, not a contract
   * difference.
   */
  transaction<T>(
    fn: (tx: IDocumentTransaction) => Promise<T>,
  ): Promise<T>;

  /**
   * Idempotently ensure a collection exists with the declared indexes.
   *
   * Replaces traditional schema migrations: each component declares its
   * collections at startup, the platform brings the catalogue up to date.
   *
   * Calling multiple times is safe. Removing an index from the declaration
   * does NOT drop it (additive only) — that policy is intentional to avoid
   * accidental destructive changes.
   *
   * TTL indexes guarantee that `find` will not return documents whose TTL has
   * expired. They do NOT guarantee the exact moment the row is physically
   * removed — sweeps run on a driver-specific interval.
   */
  ensureCollection(
    name: string,
    options?: EnsureCollectionOpts,
  ): Promise<void>;

  /**
   * Liveness probe. Resolves on success with latency, throws on failure.
   * Used by the gateway health endpoint and `kb-dev doctor`.
   */
  ping(): Promise<{ ok: boolean; latencyMs: number }>;

  /**
   * Graceful shutdown. Waits up to `drainTimeoutMs` for in-flight queries to
   * finish, then closes the connection pool. New operations submitted after
   * `close()` throw.
   */
  close(options?: { drainTimeoutMs?: number }): Promise<void>;
}

// ============================================================================
// Key-Value store
// ============================================================================

/**
 * Options accepted by `set` and its specialised variants.
 *
 * `ifNotExists` and `ifExists` are mutually exclusive. Setting both throws.
 * `ttlMs` is optional; absent means "no expiry".
 */
export interface SetOpts extends SignalOpts {
  ttlMs?: number;
  ifNotExists?: boolean;
  ifExists?: boolean;
}

/**
 * Durable key-value store contract.
 *
 * Distinct from `ICache` in semantics:
 * - Cache may silently evict at any time. KV must not — entries persist until
 *   explicitly deleted or until their TTL expires.
 * - Cache misses are routine and callers must have a fallback. KV misses mean
 *   the key was never set or was explicitly removed.
 *
 * Use KV for: sessions, distributed leases, idempotency keys, feature flag
 * snapshots, counters, anything where losing the entry is a bug.
 * Use `ICache` for: hot-path lookups with a recompute fallback.
 *
 * Values are `unknown` JSON-serialisable. Binary blobs belong in `IStorage`.
 *
 * Namespacing is mandatory — each plugin's keys live in an isolated space and
 * a `scan` cannot traverse outside it. Cross-plugin reads are not supported
 * by this contract; data sharing between plugins goes through `IInvoke`.
 *
 * Implementations:
 * - `@kb-labs/adapters-sqlite` — table-backed (dev / single-node prod)
 * - `@kb-labs/adapters-postgres` — Postgres KV table with LISTEN/NOTIFY (planned)
 * - `@kb-labs/adapters-redis` — Redis with AOF persistence (planned)
 * - `NoOpKVStore` — throws on use
 */
export interface IKVStore {
  /** Value or `null` if absent or expired. */
  get<T = unknown>(key: string, options?: SignalOpts): Promise<T | null>;

  /** Bulk get. Returned array is the same length as input; missing keys yield `null`. */
  getMany<T = unknown>(keys: string[], options?: SignalOpts): Promise<Array<T | null>>;

  /**
   * Set a key. Returns `true` when the write took effect, `false` otherwise.
   *
   * `{ ifNotExists: true }` → only writes when key is absent (returns false otherwise).
   * `{ ifExists: true }` → only writes when key is present (returns false otherwise).
   *
   * Setting both flags is a contract violation and throws.
   */
  set<T = unknown>(key: string, value: T, options?: SetOpts): Promise<boolean>;

  /** Bulk set. Atomic batch — either all entries are written or none. */
  setMany<T = unknown>(
    entries: Array<{ key: string; value: T; ttlMs?: number }>,
    options?: SignalOpts,
  ): Promise<void>;

  /** Shorthand for `set(key, value, { ifNotExists: true, ttlMs })`. */
  setIfNotExists<T = unknown>(
    key: string,
    value: T,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<boolean>;

  /** Returns `true` if the key existed and was removed. */
  delete(key: string, options?: SignalOpts): Promise<boolean>;

  /** Cheap existence check. Honours TTL — expired keys read as absent. */
  exists(key: string, options?: SignalOpts): Promise<boolean>;

  /**
   * Compare-and-swap. Atomically replaces `key` with `next` only if the
   * current value deep-equals `expected`. Returns `true` on success.
   *
   * Use for optimistic concurrency: read the value, compute the next value,
   * `cas` to commit; on `false` re-read and retry.
   */
  cas<T = unknown>(
    key: string,
    expected: T,
    next: T,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<boolean>;

  /**
   * Atomic increment. Initialises the key to `delta` if it does not exist.
   * Throws if the existing value is not a finite number.
   */
  incr(
    key: string,
    delta?: number,
    options?: { ttlMs?: number } & SignalOpts,
  ): Promise<number>;

  /** Remaining TTL in milliseconds, or `null` if the key has no TTL or does not exist. */
  ttl(key: string): Promise<number | null>;

  /** Set or extend the TTL of an existing key. Returns false if the key is absent. */
  expire(key: string, ttlMs: number): Promise<boolean>;

  /** Remove the TTL from a key (the entry becomes permanent). */
  persist(key: string): Promise<boolean>;

  /**
   * Cursor-based scan of keys with an optional prefix. Yields `{ key, value }`
   * pairs in batches.
   *
   * Replaces the glob-pattern `keys()` of typical KV APIs because prefix scan
   * has identical semantics across drivers whereas glob does not (Redis
   * pattern syntax differs from SQL LIKE).
   *
   * Cancellation via `signal` aborts the scan at the next batch boundary.
   */
  scan(
    prefix?: string,
    options?: { batchSize?: number } & SignalOpts,
  ): AsyncIterable<{ key: string; value: unknown }>;

  /** Liveness probe. */
  ping(): Promise<{ ok: boolean; latencyMs: number }>;

  /** Graceful shutdown. */
  close(options?: { drainTimeoutMs?: number }): Promise<void>;
}
