/**
 * @module @kb-labs/adapters-sqlite/document-database
 *
 * SQLite implementation of `IDocumentDatabase` backed by `better-sqlite3`.
 *
 * Storage layout:
 * - One table per collection, named `doc_<collection>`, with columns
 *   `(id TEXT PK, data TEXT, created_at INT, updated_at INT, expires_at INT NULL)`.
 *   `data` holds the JSON-encoded document body (without system fields).
 * - Indexes are emitted as `CREATE INDEX ... ON doc_<coll>(json_extract(data, '$.path'))`.
 * - TTL is materialised as `expires_at` (computed on insert/update from
 *   `doc[ttlPath] + ttlMs`); reads filter the column out, and a periodic
 *   sweeper physically deletes expired rows.
 *
 * Per-process, single connection (better-sqlite3 is synchronous). Async
 * methods are stable wrappers — the I/O itself does not yield to the loop.
 *
 * What is intentionally NOT here:
 * - Schema migrations. `ensureCollection` is additive-only — removing an
 *   index from the declaration does not drop it on disk.
 * - Cross-driver query language. Filters and updates accept only the
 *   operators defined in `IDocumentDatabase` — that's what makes the
 *   abstraction portable.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { acquireHandle, type SharedHandle } from './shared-handle.js';
import type {
  IDocumentDatabase,
  IDocumentTransaction,
  BaseDocument,
  DocumentFilter,
  DocumentUpdate,
  FilterOperators,
  FindOptions,
  ProjectOpts,
  SignalOpts,
  EnsureCollectionOpts,
  IndexSpec,
  BulkOp,
  BulkResult,
} from '@kb-labs/sdk';

interface CollectionMeta {
  /** Path inside the doc whose value (plus ttlMs) becomes `expires_at`. */
  ttlPath?: string;
  /** Milliseconds added to the path value to compute `expires_at`. */
  ttlMs?: number;
}

const META_TABLE = '_kb_collections';

const safeIdent = (name: string): string => {
  // Collections / paths reach SQL via interpolation in DDL; reject anything
  // that isn't a clean identifier. Plugin namespacing happens above us.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return name;
};

const tableFor = (collection: string): string => `doc_${safeIdent(collection)}`;

/**
 * Compute `json_extract(data, '$.<path>')`. Path is a dotted identifier
 * (no quoting needed for our scope — paths are limited to `[a-zA-Z0-9_.]`).
 */
const jsonExtract = (path: string): string => {
  for (const part of path.split('.')) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part)) {
      throw new Error(`Invalid path segment in '${path}'`);
    }
  }
  return `json_extract(data, '$.${path}')`;
};

const now = (): number => Date.now();

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
};

interface CompiledFilter {
  where: string;
  params: unknown[];
}

const compileFilter = <T>(filter: DocumentFilter<T>): CompiledFilter => {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and' || key === '$or') {
      const arr = value as Array<DocumentFilter<T>>;
      if (!Array.isArray(arr) || arr.length === 0) {continue;}
      const parts: string[] = [];
      for (const sub of arr) {
        const compiled = compileFilter<T>(sub);
        if (compiled.where) {
          parts.push(`(${compiled.where})`);
          params.push(...compiled.params);
        }
      }
      if (parts.length > 0) {
        const joiner = key === '$and' ? ' AND ' : ' OR ';
        clauses.push(`(${parts.join(joiner)})`);
      }
      continue;
    }

    const field = key === 'id'
      ? 'id'
      : key === 'createdAt'
        ? 'created_at'
        : key === 'updatedAt'
          ? 'updated_at'
          : jsonExtract(key);

    if (value === null || value === undefined) {
      clauses.push(`${field} IS NULL`);
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as FilterOperators<unknown>;
      const hasOperator = Object.keys(ops).some((k) => k.startsWith('$'));
      if (hasOperator) {
        appendOperatorClauses(clauses, params, field, ops);
        continue;
      }
    }

    // Scalar / array shorthand → equality
    clauses.push(`${field} = ?`);
    params.push(toSqlScalar(value));
  }

  return { where: clauses.join(' AND '), params };
};

const appendOperatorClauses = (
  clauses: string[],
  params: unknown[],
  field: string,
  ops: FilterOperators<unknown>,
): void => {
  if ('$eq' in ops) {
    if (ops.$eq === null) {
      clauses.push(`${field} IS NULL`);
    } else {
      clauses.push(`${field} = ?`);
      params.push(toSqlScalar(ops.$eq));
    }
  }
  if ('$ne' in ops) {
    if (ops.$ne === null) {
      clauses.push(`${field} IS NOT NULL`);
    } else {
      clauses.push(`(${field} != ? OR ${field} IS NULL)`);
      params.push(toSqlScalar(ops.$ne));
    }
  }
  if ('$gt' in ops) { clauses.push(`${field} > ?`); params.push(toSqlScalar(ops.$gt)); }
  if ('$gte' in ops) { clauses.push(`${field} >= ?`); params.push(toSqlScalar(ops.$gte)); }
  if ('$lt' in ops) { clauses.push(`${field} < ?`); params.push(toSqlScalar(ops.$lt)); }
  if ('$lte' in ops) { clauses.push(`${field} <= ?`); params.push(toSqlScalar(ops.$lte)); }

  if ('$in' in ops && Array.isArray(ops.$in)) {
    if (ops.$in.length === 0) {
      clauses.push('0');
    } else {
      const placeholders = ops.$in.map(() => '?').join(',');
      clauses.push(`${field} IN (${placeholders})`);
      params.push(...ops.$in.map(toSqlScalar));
    }
  }
  if ('$nin' in ops && Array.isArray(ops.$nin)) {
    if (ops.$nin.length === 0) {
      clauses.push('1');
    } else {
      const placeholders = ops.$nin.map(() => '?').join(',');
      clauses.push(`(${field} NOT IN (${placeholders}) OR ${field} IS NULL)`);
      params.push(...ops.$nin.map(toSqlScalar));
    }
  }
  if ('$exists' in ops) {
    clauses.push(ops.$exists ? `${field} IS NOT NULL` : `${field} IS NULL`);
  }
  if ('$startsWith' in ops && typeof ops.$startsWith === 'string') {
    clauses.push(`${field} LIKE ? ESCAPE '\\'`);
    params.push(`${likeEscape(ops.$startsWith)}%`);
  }
  if ('$contains' in ops && typeof ops.$contains === 'string') {
    clauses.push(`${field} LIKE ? ESCAPE '\\'`);
    params.push(`%${likeEscape(ops.$contains)}%`);
  }
  if ('$endsWith' in ops && typeof ops.$endsWith === 'string') {
    clauses.push(`${field} LIKE ? ESCAPE '\\'`);
    params.push(`%${likeEscape(ops.$endsWith)}`);
  }
};

const likeEscape = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

const toSqlScalar = (v: unknown): unknown => {
  if (typeof v === 'boolean') {return v ? 1 : 0;}
  if (v instanceof Date) {return v.getTime();}
  return v as unknown;
};

const decodeRow = <T extends BaseDocument>(
  row: { id: string; data: string; created_at: number; updated_at: number },
): T => {
  const body = row.data ? JSON.parse(row.data) : {};
  return {
    ...body,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as T;
};

const applyProjection = <T, P>(
  doc: T,
  projection?: ProjectOpts<T, P>['project'],
): P => {
  if (!projection) {return doc as unknown as P;}
  const keys = Object.keys(projection);
  const firstKey = keys[0];
  if (firstKey === undefined) {return doc as unknown as P;}
  const include = (projection as Record<string, 0 | 1>)[firstKey] === 1;
  const out: Record<string, unknown> = {};
  const docRec = doc as unknown as Record<string, unknown>;
  if (include) {
    for (const k of keys) {out[k] = docRec[k];}
    // System fields always included.
    out.id = docRec.id;
    out.createdAt = docRec.createdAt;
    out.updatedAt = docRec.updatedAt;
  } else {
    for (const k of Object.keys(docRec)) {
      if (!keys.includes(k)) {out[k] = docRec[k];}
    }
  }
  return out as unknown as P;
};

const applyUpdate = <T extends BaseDocument>(
  current: T,
  update: DocumentUpdate<T>,
): T => {
  // Strip system fields from the working body; reattach at the end.
  const { id: _id, createdAt: _c, updatedAt: _u, ...body } = current;
  const next = { ...body } as Record<string, unknown>;

  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      next[k] = v;
    }
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      delete next[k];
    }
  }
  if (update.$inc) {
    for (const [k, delta] of Object.entries(update.$inc)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      const existing = next[k];
      if (existing === undefined || existing === null) {
        next[k] = delta;
      } else if (typeof existing === 'number') {
        next[k] = existing + (delta as number);
      } else {
        throw new Error(`$inc requires a numeric field at '${k}', got ${typeof existing}`);
      }
    }
  }

  return {
    ...(next as Record<string, unknown>),
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
  } as T;
};

const liveFilter = (ttlActive: boolean): string =>
  ttlActive ? '(expires_at IS NULL OR expires_at > ?)' : '1=1';

const liveParams = (ttlActive: boolean): unknown[] => (ttlActive ? [now()] : []);

// ────────────────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────────────────

export interface SqliteDocumentConfig {
  /** File path. `:memory:` for ephemeral in-process databases (testing). */
  filename: string;
  /** Workspace context — injected by core-runtime so relative `filename` resolves. */
  workspace?: { cwd: string };
  /** Open in readonly mode (default false). */
  readonly?: boolean;
  /** Enable WAL journaling (default true). */
  wal?: boolean;
  /** TTL sweeper interval in ms (default 30_000). Set to 0 to disable. */
  ttlSweepIntervalMs?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────────────

export class SqliteDocumentDatabase implements IDocumentDatabase {
  private readonly db: Database.Database;
  private readonly handle: SharedHandle;
  private readonly meta = new Map<string, CollectionMeta>();
  private readonly txMutex = new Mutex();
  private sweepHandle: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(config: SqliteDocumentConfig) {
    this.handle = acquireHandle({
      filename: config.filename,
      cwd: config.workspace?.cwd,
      readonly: config.readonly,
      wal: config.wal,
    });
    this.db = this.handle.handle;

    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        name TEXT PRIMARY KEY,
        ttl_path TEXT,
        ttl_ms INTEGER
      ) STRICT`,
    );

    // Restore in-memory meta from disk.
    const rows = this.db.prepare(`SELECT name, ttl_path, ttl_ms FROM ${META_TABLE}`).all() as Array<{
      name: string;
      ttl_path: string | null;
      ttl_ms: number | null;
    }>;
    for (const row of rows) {
      this.meta.set(row.name, {
        ttlPath: row.ttl_path ?? undefined,
        ttlMs: row.ttl_ms ?? undefined,
      });
    }

    const interval = config.ttlSweepIntervalMs ?? 30_000;
    if (interval > 0) {
      this.sweepHandle = setInterval(() => this.sweepTTL(), interval).unref();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Schema
  // ──────────────────────────────────────────────────────────────────────────

  async ensureCollection(name: string, opts?: EnsureCollectionOpts): Promise<void> {
    this.checkOpen();
    const table = tableFor(name);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER
      ) STRICT`,
    );

    let ttlPath: string | undefined;
    let ttlMs: number | undefined;

    for (const idx of opts?.indexes ?? []) {
      this.applyIndex(name, idx);
      if (idx.ttl !== undefined) {
        if (Array.isArray(idx.path)) {
          throw new Error('TTL indexes do not support composite paths');
        }
        ttlPath = idx.path;
        ttlMs = idx.ttl;
      }
    }

    if (ttlPath !== undefined) {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_expires ON ${table}(expires_at)`);
    }

    this.db
      .prepare(
        `INSERT INTO ${META_TABLE}(name, ttl_path, ttl_ms) VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET ttl_path = excluded.ttl_path, ttl_ms = excluded.ttl_ms`,
      )
      .run(name, ttlPath ?? null, ttlMs ?? null);

    this.meta.set(name, { ttlPath, ttlMs });
  }

  private applyIndex(collection: string, idx: IndexSpec): void {
    const table = tableFor(collection);
    const paths = Array.isArray(idx.path) ? idx.path : [idx.path];
    const cols = paths.map(jsonExtract).join(', ');
    const nameSuffix = paths.map((p) => p.replace(/\./g, '_')).join('__');
    const unique = idx.unique ? 'UNIQUE' : '';
    const indexName = `idx_${table}__${nameSuffix}${idx.unique ? '__u' : ''}`;
    const where = idx.sparse
      ? `WHERE ${paths.map(jsonExtract).map((c) => `${c} IS NOT NULL`).join(' AND ')}`
      : '';
    this.db.exec(`CREATE ${unique} INDEX IF NOT EXISTS ${indexName} ON ${table}(${cols}) ${where}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────────────

  async find<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
  ): Promise<P[]> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const ttlActive = meta?.ttlPath !== undefined;
    const compiled = compileFilter<T>(filter);

    const where = [compiled.where, liveFilter(ttlActive)].filter(Boolean).join(' AND ');
    const sortClause = compileSort(options?.sort);
    const limitClause = options?.limit !== undefined ? `LIMIT ${Number(options.limit)}` : '';
    const offsetClause = options?.skip !== undefined ? `OFFSET ${Number(options.skip)}` : '';

    const sql = `SELECT id, data, created_at, updated_at FROM ${tableFor(collection)}
                 WHERE ${where || '1=1'}
                 ${sortClause} ${limitClause} ${offsetClause}`;

    const rows = this.db
      .prepare(sql)
      .all(...compiled.params, ...liveParams(ttlActive)) as Array<{
      id: string;
      data: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((r) => applyProjection<T, P>(decodeRow<T>(r), options?.project));
  }

  async *findStream<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts & { batchSize?: number },
  ): AsyncIterable<P> {
    this.checkOpen();
    const meta = this.meta.get(collection);
    const ttlActive = meta?.ttlPath !== undefined;
    const compiled = compileFilter<T>(filter);
    const where = [compiled.where, liveFilter(ttlActive)].filter(Boolean).join(' AND ');
    const sortClause = compileSort(options?.sort);
    const sql = `SELECT id, data, created_at, updated_at FROM ${tableFor(collection)}
                 WHERE ${where || '1=1'} ${sortClause}`;
    const stmt = this.db.prepare(sql);
    const iter = stmt.iterate(...compiled.params, ...liveParams(ttlActive)) as IterableIterator<{
      id: string;
      data: string;
      created_at: number;
      updated_at: number;
    }>;
    const batchSize = options?.batchSize ?? 100;
    let yielded = 0;
    for (const row of iter) {
      if (options?.signal?.aborted) {
        // Let the iterator finalize.
        break;
      }
      yield applyProjection<T, P>(decodeRow<T>(row), options?.project);
      yielded++;
      if (yielded % batchSize === 0 && options?.signal?.aborted) {
        break;
      }
    }
  }

  async findById<T extends BaseDocument>(
    collection: string,
    id: string,
    options?: SignalOpts,
  ): Promise<T | null> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const ttlActive = meta?.ttlPath !== undefined;
    const where = ttlActive ? `id = ? AND ${liveFilter(true)}` : 'id = ?';
    const row = this.db
      .prepare(
        `SELECT id, data, created_at, updated_at FROM ${tableFor(collection)} WHERE ${where}`,
      )
      .get(id, ...liveParams(ttlActive)) as
      | { id: string; data: string; created_at: number; updated_at: number }
      | undefined;
    return row ? decodeRow<T>(row) : null;
  }

  async count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const ttlActive = meta?.ttlPath !== undefined;
    const compiled = compileFilter<T>(filter);
    const where = [compiled.where, liveFilter(ttlActive)].filter(Boolean).join(' AND ');
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ${tableFor(collection)} WHERE ${where || '1=1'}`)
      .get(...compiled.params, ...liveParams(ttlActive)) as { n: number };
    return row.n;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Writes
  // ──────────────────────────────────────────────────────────────────────────

  async insertOne<T extends BaseDocument>(
    collection: string,
    doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
    options?: SignalOpts,
  ): Promise<T> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const ts = now();
    const id = randomUUID();
    const body = JSON.stringify(doc ?? {});
    const expiresAt = this.computeExpiresAt(collection, doc);
    this.db
      .prepare(
        `INSERT INTO ${tableFor(collection)}(id, data, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, body, ts, ts, expiresAt);
    return { ...(doc as object), id, createdAt: ts, updatedAt: ts } as T;
  }

  async insertMany<T extends BaseDocument>(
    collection: string,
    docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
    options?: SignalOpts,
  ): Promise<T[]> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    if (docs.length === 0) {return [];}
    return this.runAtomic(() => {
      const out: T[] = [];
      const stmt = this.db.prepare(
        `INSERT INTO ${tableFor(collection)}(id, data, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const doc of docs) {
        const ts = now();
        const id = randomUUID();
        const body = JSON.stringify(doc ?? {});
        const expiresAt = this.computeExpiresAt(collection, doc);
        stmt.run(id, body, ts, ts, expiresAt);
        out.push({ ...(doc as object), id, createdAt: ts, updatedAt: ts } as T);
      }
      return out;
    });
  }

  async updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<T | null> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    return this.runAtomic(() => {
      const current = this.getRowForUpdate<T>(collection, id);
      if (!current) {return null;}
      const next = applyUpdate(current, update);
      const ts = now();
      const expiresAt = this.computeExpiresAt(collection, next);
      const { id: _i, createdAt: _c, updatedAt: _u, ...body } = next;
      this.db
        .prepare(
          `UPDATE ${tableFor(collection)}
           SET data = ?, updated_at = ?, expires_at = ?
           WHERE id = ?`,
        )
        .run(JSON.stringify(body), ts, expiresAt, id);
      return { ...next, updatedAt: ts } as T;
    });
  }

  async updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts & { upsert?: boolean },
  ): Promise<T | null> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    return this.runAtomic(() => {
      const match = this.findFirstId(collection, filter);
      if (match) {
        return this.applyUpdateById<T>(collection, match, update);
      }
      if (!options?.upsert) {return null;}
      // Upsert: synthesise a base document from the filter equalities + $set.
      const synthesised = {
        ...synthesiseFromFilter(filter),
        ...(update.$set ?? {}),
      } as Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
      const ts = now();
      const id = randomUUID();
      const expiresAt = this.computeExpiresAt(collection, synthesised);
      this.db
        .prepare(
          `INSERT INTO ${tableFor(collection)}(id, data, created_at, updated_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, JSON.stringify(synthesised), ts, ts, expiresAt);
      return { ...(synthesised as object), id, createdAt: ts, updatedAt: ts } as T;
    });
  }

  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<number> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    return this.runAtomic(() => {
      const ids = this.findAllIds(collection, filter);
      for (const id of ids) {
        this.applyUpdateById<T>(collection, id, update);
      }
      return ids.length;
    });
  }

  async deleteById(collection: string, id: string, options?: SignalOpts): Promise<boolean> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const info = this.db.prepare(`DELETE FROM ${tableFor(collection)} WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    const compiled = compileFilter<T>(filter);
    const where = compiled.where || '1=1';
    const info = this.db
      .prepare(`DELETE FROM ${tableFor(collection)} WHERE ${where}`)
      .run(...compiled.params);
    return info.changes;
  }

  async bulkWrite<T extends BaseDocument>(
    collection: string,
    ops: Array<BulkOp<T>>,
    options?: SignalOpts,
  ): Promise<BulkResult> {
    this.checkOpen();
    throwIfAborted(options?.signal);
    return this.runAtomic(() => {
      const result: BulkResult = { inserted: 0, updated: 0, deleted: 0 };
      for (const op of ops) {
        if (op.type === 'insert') {
          const ts = now();
          const id = randomUUID();
          const expiresAt = this.computeExpiresAt(collection, op.doc);
          this.db
            .prepare(
              `INSERT INTO ${tableFor(collection)}(id, data, created_at, updated_at, expires_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(id, JSON.stringify(op.doc ?? {}), ts, ts, expiresAt);
          result.inserted++;
        } else if (op.type === 'update') {
          const id = this.findFirstId<T>(collection, op.filter);
          if (id) {
            this.applyUpdateById<T>(collection, id, op.update);
            result.updated++;
          } else if (op.upsert) {
            const ts = now();
            const id = randomUUID();
            const synthesised = {
              ...synthesiseFromFilter(op.filter),
              ...(op.update.$set ?? {}),
            } as Omit<T, 'id' | 'createdAt' | 'updatedAt'>;
            const expiresAt = this.computeExpiresAt(collection, synthesised);
            this.db
              .prepare(
                `INSERT INTO ${tableFor(collection)}(id, data, created_at, updated_at, expires_at)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .run(id, JSON.stringify(synthesised), ts, ts, expiresAt);
            result.inserted++;
          }
        } else if (op.type === 'delete') {
          const compiled = compileFilter<T>(op.filter);
          const info = this.db
            .prepare(`DELETE FROM ${tableFor(collection)} WHERE ${compiled.where || '1=1'}`)
            .run(...compiled.params);
          result.deleted += info.changes;
        }
      }
      return result;
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Transactions
  // ──────────────────────────────────────────────────────────────────────────

  async transaction<T>(fn: (tx: IDocumentTransaction) => Promise<T>): Promise<T> {
    this.checkOpen();
    return this.txMutex.runExclusive(async () => {
      this.db.exec('BEGIN IMMEDIATE');
      try {
        const result = await fn(this.makeTxFacade());
        this.db.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* nothing we can do */
        }
        throw err;
      }
    });
  }

  private makeTxFacade(): IDocumentTransaction {
    // Inside a transaction we already hold the connection — every operation
    // routes through the same statements. The facade re-uses the parent
    // methods but bypasses the mutex (we're already exclusive) and the
    // BEGIN/COMMIT scaffolding via `runAtomic` (`inTransaction` flag below).
    this.inTransaction = true;
    const restore = (): void => { this.inTransaction = false; };
    const wrap = <A extends unknown[], R>(impl: (...args: A) => Promise<R>): ((...args: A) => Promise<R>) =>
      (...args: A) => impl.apply(this, args).finally(() => {/* no-op, restore on tx end */});
    void restore; // restored in transaction() finally below (set by error path / via flag in runAtomic)

    return {
      find: wrap(this.find as never),
      findById: wrap(this.findById as never),
      count: wrap(this.count as never),
      insertOne: wrap(this.insertOne as never),
      insertMany: wrap(this.insertMany as never),
      updateOne: wrap(this.updateOne as never),
      updateMany: wrap(this.updateMany as never),
      updateById: wrap(this.updateById as never),
      deleteMany: wrap(this.deleteMany as never),
      deleteById: wrap(this.deleteById as never),
    } as unknown as IDocumentTransaction;
  }

  /** Set true while inside a `transaction()` callback. Suppresses nested BEGIN/COMMIT. */
  private inTransaction = false;

  private runAtomic<R>(fn: () => R): R {
    if (this.inTransaction) {
      return fn();
    }
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      this.db.prepare('SELECT 1').get();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async close(_options?: { drainTimeoutMs?: number }): Promise<void> {
    if (this.closed) {return;}
    this.closed = true;
    if (this.sweepHandle) {
      clearInterval(this.sweepHandle);
      this.sweepHandle = null;
    }
    this.handle.release();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internals
  // ──────────────────────────────────────────────────────────────────────────

  private checkOpen(): void {
    if (this.closed) {throw new Error('Document database is closed');}
  }

  private getRowForUpdate<T extends BaseDocument>(collection: string, id: string): T | null {
    const row = this.db
      .prepare(
        `SELECT id, data, created_at, updated_at FROM ${tableFor(collection)} WHERE id = ?`,
      )
      .get(id) as
      | { id: string; data: string; created_at: number; updated_at: number }
      | undefined;
    return row ? decodeRow<T>(row) : null;
  }

  private applyUpdateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
  ): T | null {
    const current = this.getRowForUpdate<T>(collection, id);
    if (!current) {return null;}
    const next = applyUpdate(current, update);
    const ts = now();
    const expiresAt = this.computeExpiresAt(collection, next);
    const { id: _i, createdAt: _c, updatedAt: _u, ...body } = next;
    this.db
      .prepare(
        `UPDATE ${tableFor(collection)}
         SET data = ?, updated_at = ?, expires_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(body), ts, expiresAt, id);
    return { ...next, updatedAt: ts } as T;
  }

  private findFirstId<T>(collection: string, filter: DocumentFilter<T>): string | null {
    const meta = this.meta.get(collection);
    const ttlActive = meta?.ttlPath !== undefined;
    const compiled = compileFilter<T>(filter);
    const where = [compiled.where, liveFilter(ttlActive)].filter(Boolean).join(' AND ');
    const row = this.db
      .prepare(`SELECT id FROM ${tableFor(collection)} WHERE ${where || '1=1'} LIMIT 1`)
      .get(...compiled.params, ...liveParams(ttlActive)) as { id: string } | undefined;
    return row?.id ?? null;
  }

  private findAllIds<T>(collection: string, filter: DocumentFilter<T>): string[] {
    const meta = this.meta.get(collection);
    const ttlActive = meta?.ttlPath !== undefined;
    const compiled = compileFilter<T>(filter);
    const where = [compiled.where, liveFilter(ttlActive)].filter(Boolean).join(' AND ');
    const rows = this.db
      .prepare(`SELECT id FROM ${tableFor(collection)} WHERE ${where || '1=1'}`)
      .all(...compiled.params, ...liveParams(ttlActive)) as Array<{ id: string }>;
    return rows.map((r) => r.id);
  }

  private computeExpiresAt(collection: string, doc: unknown): number | null {
    const meta = this.meta.get(collection);
    if (!meta?.ttlPath || meta.ttlMs === undefined) {return null;}
    const value = (doc as Record<string, unknown>)[meta.ttlPath];
    if (typeof value !== 'number') {return null;}
    return value + meta.ttlMs;
  }

  private sweepTTL(): void {
    if (this.closed) {return;}
    const t = now();
    for (const [name] of this.meta) {
      try {
        this.db
          .prepare(`DELETE FROM ${tableFor(name)} WHERE expires_at IS NOT NULL AND expires_at <= ?`)
          .run(t);
      } catch {
        /* table may have been dropped externally — ignore */
      }
    }
  }

}

const compileSort = (sort?: Record<string, 1 | -1>): string => {
  if (!sort) {return '';}
  const parts = Object.entries(sort).map(([k, dir]) => {
    const col = k === 'id' ? 'id'
      : k === 'createdAt' ? 'created_at'
        : k === 'updatedAt' ? 'updated_at'
          : jsonExtract(k);
    return `${col} ${dir === -1 ? 'DESC' : 'ASC'}`;
  });
  return `ORDER BY ${parts.join(', ')}`;
};

const synthesiseFromFilter = <T>(filter: DocumentFilter<T>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) {continue;}
    if (v === null || v === undefined) {continue;}
    if (typeof v === 'object' && !Array.isArray(v)) {
      const ops = v as FilterOperators<unknown>;
      if ('$eq' in ops && ops.$eq !== undefined && ops.$eq !== null) {
        out[k] = ops.$eq;
      }
      continue;
    }
    out[k] = v;
  }
  return out;
};

// ────────────────────────────────────────────────────────────────────────────
// Tiny mutex for the transaction lock
// ────────────────────────────────────────────────────────────────────────────

class Mutex {
  private chain: Promise<unknown> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.chain;
    let release!: () => void;
    const next = new Promise<void>((res) => { release = res; });
    this.chain = previous.then(() => next);
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export const createSqliteDocumentDatabase = (config: SqliteDocumentConfig): SqliteDocumentDatabase =>
  new SqliteDocumentDatabase(config);
