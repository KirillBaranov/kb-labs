/**
 * @module @kb-labs/adapters-mongodb
 *
 * MongoDB implementation of `IDocumentDatabase`.
 *
 * Storage model:
 * - Each platform "collection" maps 1:1 to a Mongo collection of the same
 *   name. Documents are stored at the top level (no envelope) — the
 *   contract's three system fields (`id`, `createdAt`, `updatedAt`) become
 *   `_id` (string ULID), and two Unix-ms `Date` / `number` fields.
 * - `id` ↔ `_id` is translated transparently on every boundary so callers
 *   never see Mongo's `_id` naming.
 *
 * Filter / update translation:
 * - Most operators (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`,
 *   `$nin`, `$exists`, `$and`, `$or`, `$set`, `$unset`, `$inc`) map 1:1.
 * - `$startsWith` / `$contains` / `$endsWith` become anchored `$regex`
 *   patterns with their argument escaped, in case-sensitive mode — matches
 *   the contract's portable substring semantics.
 *
 * Transactions / bulkWrite:
 * - `bulkWrite` and `insertMany` run inside a Mongo session-level
 *   transaction so they're truly atomic (no partial inserts). This
 *   requires the Mongo deployment to be a replica set — single-node
 *   `mongod` will throw on the first `startTransaction`. That's a
 *   deployment caveat, not a contract divergence.
 *
 * TTL:
 * - `ensureCollection({ indexes: [{ path, ttl }] })` creates a Mongo TTL
 *   index with `expireAfterSeconds = ttl / 1000`. The adapter stores the
 *   indexed field as a `Date` so Mongo's TTL monitor can sweep it; the
 *   value remains a Unix-ms `number` to the caller.
 *
 * What is intentionally NOT here:
 * - Aggregation pipeline, change streams, text search, `$lookup`, full
 *   regex (PCRE flavours) — these are Mongo-only and would break the
 *   abstraction.
 */

import { randomUUID } from 'node:crypto';
import {
  MongoClient,
  type Db,
  type ClientSession,
  type Filter,
  type Sort,
  type UpdateFilter,
  type AnyBulkWriteOperation,
  type IndexSpecification,
} from 'mongodb';
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
} from '@kb-labs/sdk/adapters';

export { manifest } from './manifest.js';

const META_COLLECTION = '_kb_collections';

interface CollectionMeta {
  ttlPath?: string;
  ttlMs?: number;
}

interface MetaDoc {
  _id: string;            // collection name
  ttlPath?: string;
  ttlMs?: number;
}

export interface MongoDBConfig {
  /** Connection URI without a database path, e.g. `mongodb://127.0.0.1:27017`. */
  uri?: string;
  /** Database name. Used together with `uri`. */
  database?: string;
  /**
   * Single connection string with the database in the path, e.g.
   * `mongodb://127.0.0.1:27017/kblabs`. Provided as an alternative to the
   * `uri` + `database` pair so the adapter matches the platform's `url`
   * convention (the same one the Redis adapter uses). When `url` is set,
   * `uri` and `database` are derived from it.
   */
  url?: string;
  options?: {
    maxPoolSize?: number;
    serverSelectionTimeoutMS?: number;
  };
}

/**
 * Normalise the two accepted config shapes into a concrete `{ uri, database }`
 * pair. Throws a clear, actionable error when neither shape provides a
 * connection target — far better than the opaque `Cannot read properties of
 * undefined (reading 'startsWith')` the Mongo driver throws on `new
 * MongoClient(undefined)`.
 */
export function resolveConnection(config: MongoDBConfig): { uri: string; database: string } {
  // Explicit uri + database wins.
  if (config.uri) {
    return {
      uri: config.uri,
      database: config.database ?? databaseFromUrl(config.url ?? config.uri) ?? 'kblabs',
    };
  }

  // Otherwise derive from a single `url` connection string.
  if (config.url) {
    const database = config.database ?? databaseFromUrl(config.url);
    if (!database) {
      throw new Error(
        `[adapters-mongodb] config.url "${config.url}" has no database path. ` +
          `Use "mongodb://host:port/<database>" or set "database" explicitly.`,
      );
    }
    return { uri: stripDatabaseFromUrl(config.url), database };
  }

  throw new Error(
    '[adapters-mongodb] missing connection config: provide either ' +
      '{ uri, database } or { url: "mongodb://host:port/database" }.',
  );
}

/** Extract the database name from the path segment of a Mongo connection URL. */
function databaseFromUrl(url: string): string | undefined {
  // mongodb://host:port/<db>?opts  →  <db>
  const match = url.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/);
  return match?.[1];
}

/** Drop the `/database` path segment so the URI can be passed to MongoClient. */
function stripDatabaseFromUrl(url: string): string {
  // Keep scheme + authority + any query string, drop the path.
  return url.replace(/^(mongodb(?:\+srv)?:\/\/[^/]+)\/[^?]*(\?.*)?$/, '$1$2');
}

const now = (): number => Date.now();

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
};

const likeEscape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ────────────────────────────────────────────────────────────────────────────
// Filter & update translation
// ────────────────────────────────────────────────────────────────────────────

const mapField = (key: string): string => (key === 'id' ? '_id' : key);

const translateFilter = <T>(filter: DocumentFilter<T>): Filter<Document> => {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(filter)) {
    if (rawKey === '$and' || rawKey === '$or') {
      const arr = value as Array<DocumentFilter<T>>;
      if (!Array.isArray(arr) || arr.length === 0) {continue;}
      out[rawKey] = arr.map((sub) => translateFilter<T>(sub));
      continue;
    }
    const key = mapField(rawKey);

    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as FilterOperators<unknown>;
      const hasOperator = Object.keys(ops).some((k) => k.startsWith('$'));
      if (hasOperator) {
        out[key] = translateOperators(ops);
        continue;
      }
    }
    out[key] = value;
  }
  return out as Filter<Document>;
};

const translateOperators = (ops: FilterOperators<unknown>): Record<string, unknown> => {
  const mongo: Record<string, unknown> = {};
  if ('$eq' in ops) {mongo.$eq = ops.$eq;}
  if ('$ne' in ops) {mongo.$ne = ops.$ne;}
  if ('$gt' in ops) {mongo.$gt = ops.$gt;}
  if ('$gte' in ops) {mongo.$gte = ops.$gte;}
  if ('$lt' in ops) {mongo.$lt = ops.$lt;}
  if ('$lte' in ops) {mongo.$lte = ops.$lte;}
  if ('$in' in ops) {mongo.$in = ops.$in;}
  if ('$nin' in ops) {mongo.$nin = ops.$nin;}
  if ('$exists' in ops) {mongo.$exists = ops.$exists;}
  if ('$startsWith' in ops && typeof ops.$startsWith === 'string') {
    mongo.$regex = `^${likeEscape(ops.$startsWith)}`;
  }
  if ('$contains' in ops && typeof ops.$contains === 'string') {
    mongo.$regex = likeEscape(ops.$contains);
  }
  if ('$endsWith' in ops && typeof ops.$endsWith === 'string') {
    mongo.$regex = `${likeEscape(ops.$endsWith)}$`;
  }
  return mongo;
};

const translateProjection = <T, P>(p?: ProjectOpts<T, P>['project']): Record<string, 0 | 1> | undefined => {
  if (!p) {return undefined;}
  const out: Record<string, 0 | 1> = {};
  for (const [k, v] of Object.entries(p as Record<string, 0 | 1>)) {
    out[mapField(k)] = v;
  }
  return out;
};

const translateSort = (sort?: Record<string, 1 | -1>): Sort | undefined => {
  if (!sort) {return undefined;}
  const out: Record<string, 1 | -1> = {};
  for (const [k, v] of Object.entries(sort)) {out[mapField(k)] = v;}
  return out as Sort;
};

/**
 * Build the `$set` / `$inc` / `$unset` payload, mapping `id`→`_id`,
 * adding `updatedAt`, and (for upsert paths) seeding `createdAt`.
 */
const buildUpdate = <T>(
  update: DocumentUpdate<T>,
  options: { upsert?: boolean } = {},
): UpdateFilter<Document> => {
  const $set: Record<string, unknown> = { updatedAt: now() };
  const $unset: Record<string, 1 | true> = {};
  const $inc: Record<string, number> = {};
  const $setOnInsert: Record<string, unknown> = {};

  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      $set[k] = v;
    }
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      $unset[k] = 1;
    }
  }
  if (update.$inc) {
    for (const [k, n] of Object.entries(update.$inc)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      $inc[k] = n as number;
    }
  }
  if (options.upsert) {
    $setOnInsert._id = randomUUID();
    $setOnInsert.createdAt = now();
  }

  const out: UpdateFilter<Document> = {};
  if (Object.keys($set).length > 0) {(out as Record<string, unknown>).$set = $set;}
  if (Object.keys($unset).length > 0) {(out as Record<string, unknown>).$unset = $unset;}
  if (Object.keys($inc).length > 0) {(out as Record<string, unknown>).$inc = $inc;}
  if (Object.keys($setOnInsert).length > 0) {(out as Record<string, unknown>).$setOnInsert = $setOnInsert;}
  return out;
};

const fromMongo = <T extends BaseDocument>(doc: Document | null, meta?: CollectionMeta): T | null => {
  if (!doc) {return null;}
  const { _id, ...rest } = doc as { _id: unknown } & Record<string, unknown>;
  const out: Record<string, unknown> = { ...rest, id: _id as string };
  // TTL field stored as Date → expose as Unix-ms number per contract.
  if (meta?.ttlPath && out[meta.ttlPath] instanceof Date) {
    out[meta.ttlPath] = (out[meta.ttlPath] as Date).getTime();
  }
  return out as T;
};

const toMongoBody = (
  body: Record<string, unknown>,
  meta?: CollectionMeta,
): Record<string, unknown> => {
  if (!meta?.ttlPath) {return body;}
  const v = body[meta.ttlPath];
  if (typeof v === 'number') {
    return { ...body, [meta.ttlPath]: new Date(v) };
  }
  return body;
};

// ────────────────────────────────────────────────────────────────────────────
// Adapter
// ────────────────────────────────────────────────────────────────────────────

export class MongoDBAdapter implements IDocumentDatabase {
  private readonly client: MongoClient;
  private readonly db: Db;
  private readonly meta = new Map<string, CollectionMeta>();
  private metaLoaded: Promise<void> | null = null;
  private closed = false;

  constructor(private config: MongoDBConfig) {
    const { uri, database } = resolveConnection(config);
    this.client = new MongoClient(uri, {
      maxPoolSize: config.options?.maxPoolSize ?? 10,
      serverSelectionTimeoutMS: config.options?.serverSelectionTimeoutMS ?? 30_000,
    });
    this.db = this.client.db(database);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ──────────────────────────────────────────────────────────────────────────

  private async ensureConnected(): Promise<void> {
    if (this.closed) {throw new Error('Document database is closed');}
    await this.client.connect();
    if (!this.metaLoaded) {
      this.metaLoaded = (async () => {
        const docs = await this.db.collection<MetaDoc>(META_COLLECTION).find({}).toArray();
        for (const d of docs) {
          this.meta.set(d._id, { ttlPath: d.ttlPath, ttlMs: d.ttlMs });
        }
      })();
    }
    await this.metaLoaded;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.client.db('admin').command({ ping: 1 });
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }

  async close(opts?: { drainTimeoutMs?: number }): Promise<void> {
    if (this.closed) {return;}
    this.closed = true;
    try {
      // The Mongo driver supports a `force` option; we deliberately wait
      // for in-flight ops to finish (up to the caller-provided timeout).
      await Promise.race([
        this.client.close(),
        new Promise<void>((resolve) =>
          setTimeout(resolve, opts?.drainTimeoutMs ?? 5000),
        ),
      ]);
    } catch {
      /* swallow — already-closed or transport error at shutdown */
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Schema
  // ──────────────────────────────────────────────────────────────────────────

  async ensureCollection(name: string, opts?: EnsureCollectionOpts): Promise<void> {
    await this.ensureConnected();

    // Idempotent collection creation.
    const existing = await this.db.listCollections({ name }).toArray();
    if (existing.length === 0) {
      try {
        await this.db.createCollection(name);
      } catch {
        // Race: another process beat us to it. Safe to ignore.
      }
    }

    let ttlPath: string | undefined;
    let ttlMs: number | undefined;
    const indexSpecs: IndexSpecification[] = [];

    for (const idx of opts?.indexes ?? []) {
      indexSpecs.push(this.translateIndexSpec(idx));
      if (idx.ttl !== undefined) {
        if (Array.isArray(idx.path)) {
          throw new Error('TTL indexes do not support composite paths');
        }
        ttlPath = idx.path;
        ttlMs = idx.ttl;
      }
    }

    if (indexSpecs.length > 0) {
      const col = this.db.collection(name);
      // Convert to the shape `createIndexes` expects.
      const descriptors = (opts?.indexes ?? []).map((idx) => ({
        key: this.indexKey(idx),
        name: this.indexName(idx),
        ...(idx.unique ? { unique: true } : {}),
        ...(idx.sparse ? { sparse: true } : {}),
        ...(idx.ttl !== undefined ? { expireAfterSeconds: Math.floor(idx.ttl / 1000) } : {}),
      }));
      try {
        await col.createIndexes(descriptors);
      } catch (err) {
        // `createIndexes` is idempotent on identical specs; if a definition
        // changed (e.g. unique flag flip) the driver throws. Re-throwing
        // here is correct — the operator has to migrate manually.
        throw err;
      }
    }

    await this.db.collection<MetaDoc>(META_COLLECTION).updateOne(
      { _id: name },
      { $set: { _id: name, ttlPath: ttlPath ?? undefined, ttlMs: ttlMs ?? undefined } },
      { upsert: true },
    );
    this.meta.set(name, { ttlPath, ttlMs });
  }

  private indexKey(idx: IndexSpec): Record<string, 1> {
    const paths = Array.isArray(idx.path) ? idx.path : [idx.path];
    const out: Record<string, 1> = {};
    for (const p of paths) {out[mapField(p)] = 1;}
    return out;
  }

  private indexName(idx: IndexSpec): string {
    const paths = Array.isArray(idx.path) ? idx.path : [idx.path];
    const flat = paths.map((p) => p.replace(/\./g, '_')).join('__');
    return `idx_${flat}${idx.unique ? '__u' : ''}${idx.ttl !== undefined ? '__ttl' : ''}`;
  }

  private translateIndexSpec(idx: IndexSpec): IndexSpecification {
    return ({
      key: this.indexKey(idx),
      name: this.indexName(idx),
    } as unknown) as IndexSpecification;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Reads
  // ──────────────────────────────────────────────────────────────────────────

  async find<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
  ): Promise<P[]> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const col = this.db.collection(collection);
    let cursor = col.find(translateFilter<T>(filter));
    const proj = translateProjection<T, P>(options?.project);
    if (proj) {cursor = cursor.project(proj);}
    if (options?.sort) {cursor = cursor.sort(translateSort(options.sort) as Sort);}
    if (options?.skip !== undefined) {cursor = cursor.skip(options.skip);}
    if (options?.limit !== undefined) {cursor = cursor.limit(options.limit);}
    const docs = await cursor.toArray();
    return docs.map((d) => fromMongo<T>(d, meta) as unknown as P);
  }

  async *findStream<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts & { batchSize?: number },
  ): AsyncIterable<P> {
    await this.ensureConnected();
    const meta = this.meta.get(collection);
    const col = this.db.collection(collection);
    let cursor = col.find(translateFilter<T>(filter));
    const proj = translateProjection<T, P>(options?.project);
    if (proj) {cursor = cursor.project(proj);}
    if (options?.sort) {cursor = cursor.sort(translateSort(options.sort) as Sort);}
    if (options?.batchSize) {cursor = cursor.batchSize(options.batchSize);}
    try {
      for await (const doc of cursor) {
        if (options?.signal?.aborted) {break;}
        yield fromMongo<T>(doc, meta) as unknown as P;
      }
    } finally {
      await cursor.close().catch(() => {/* ignore */});
    }
  }

  async findById<T extends BaseDocument>(
    collection: string,
    id: string,
    options?: SignalOpts,
  ): Promise<T | null> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const doc = await this.db.collection(collection).findOne(({ _id: id } as unknown) as Filter<Document>);
    return fromMongo<T>(doc, meta);
  }

  async count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    return this.db.collection(collection).countDocuments(translateFilter<T>(filter));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Writes
  // ──────────────────────────────────────────────────────────────────────────

  async insertOne<T extends BaseDocument>(
    collection: string,
    doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
    options?: SignalOpts,
  ): Promise<T> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const ts = now();
    const id = randomUUID();
    const body = toMongoBody({ ...(doc as Record<string, unknown>) }, meta);
    await this.db.collection(collection).insertOne(({
      _id: id,
      ...body,
      createdAt: ts,
      updatedAt: ts,
    }) as never);
    return { ...(doc as object), id, createdAt: ts, updatedAt: ts } as T;
  }

  async insertMany<T extends BaseDocument>(
    collection: string,
    docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
    options?: SignalOpts,
  ): Promise<T[]> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    if (docs.length === 0) {return [];}
    return this.runAtomic(async (session) => {
      const meta = this.meta.get(collection);
      const ts = now();
      const records = docs.map((d) => ({
        _id: randomUUID(),
        ...toMongoBody({ ...(d as Record<string, unknown>) }, meta),
        createdAt: ts,
        updatedAt: ts,
      }));
      await this.db.collection(collection).insertMany(records as never[], { session, ordered: true });
      return records.map((r) => ({
        ...(r as Record<string, unknown>),
        id: r._id,
      })) as unknown as T[];
    });
  }

  async updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts & { upsert?: boolean },
  ): Promise<T | null> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const doc = await this.db.collection(collection).findOneAndUpdate(
      translateFilter<T>(filter),
      buildUpdate<T>(update, { upsert: options?.upsert }),
      { upsert: options?.upsert ?? false, returnDocument: 'after' },
    );
    return fromMongo<T>(doc as Document | null, meta);
  }

  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<number> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const result = await this.db
      .collection(collection)
      .updateMany(translateFilter<T>(filter), buildUpdate<T>(update));
    return result.matchedCount;
  }

  async updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
    options?: SignalOpts,
  ): Promise<T | null> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const meta = this.meta.get(collection);
    const doc = await this.db.collection(collection).findOneAndUpdate(
      ({ _id: id } as unknown) as Filter<Document>,
      buildUpdate<T>(update),
      { returnDocument: 'after' },
    );
    return fromMongo<T>(doc as Document | null, meta);
  }

  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: SignalOpts,
  ): Promise<number> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const result = await this.db
      .collection(collection)
      .deleteMany(translateFilter<T>(filter));
    return result.deletedCount;
  }

  async deleteById(collection: string, id: string, options?: SignalOpts): Promise<boolean> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    const result = await this.db
      .collection(collection)
      .deleteOne(({ _id: id } as unknown) as Filter<Document>);
    return result.deletedCount > 0;
  }

  async bulkWrite<T extends BaseDocument>(
    collection: string,
    ops: Array<BulkOp<T>>,
    options?: SignalOpts,
  ): Promise<BulkResult> {
    await this.ensureConnected();
    throwIfAborted(options?.signal);
    if (ops.length === 0) {return { inserted: 0, updated: 0, deleted: 0 };}
    return this.runAtomic(async (session) => {
      const meta = this.meta.get(collection);
      const ts = now();
      const mongoOps = ops.map((op): AnyBulkWriteOperation<Document> => {
        if (op.type === 'insert') {
          return {
            insertOne: {
              document: {
                _id: randomUUID(),
                ...toMongoBody({ ...(op.doc as Record<string, unknown>) }, meta),
                createdAt: ts,
                updatedAt: ts,
              } as never,
            },
          };
        }
        if (op.type === 'update') {
          return {
            updateOne: {
              filter: translateFilter<T>(op.filter),
              update: buildUpdate<T>(op.update, { upsert: op.upsert }),
              upsert: op.upsert ?? false,
            },
          };
        }
        return {
          deleteMany: { filter: translateFilter<T>(op.filter) },
        };
      });
      const result = await this.db
        .collection<Document>(collection)
        .bulkWrite(mongoOps, { session, ordered: true });
      return {
        inserted: result.insertedCount,
        updated: result.modifiedCount + result.upsertedCount,
        deleted: result.deletedCount,
      };
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Transactions
  // ──────────────────────────────────────────────────────────────────────────

  async transaction<R>(fn: (tx: IDocumentTransaction) => Promise<R>): Promise<R> {
    await this.ensureConnected();
    const session = this.client.startSession();
    try {
      let result!: R;
      await session.withTransaction(async () => {
        result = await fn(this.makeTxFacade(session));
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Run an operation inside an ambient transaction if one exists; otherwise
   * open and commit a fresh one. Used by `insertMany` and `bulkWrite` for
   * all-or-nothing semantics.
   */
  private async runAtomic<R>(
    fn: (session: ClientSession | undefined) => Promise<R>,
  ): Promise<R> {
    // We have no way to detect an ambient session from the caller; for
    // single-op atomicity Mongo's bulk operations are already transactional
    // on a replica set when given a session. Open a one-shot session.
    const session = this.client.startSession();
    try {
      let out!: R;
      await session.withTransaction(async () => {
        out = await fn(session);
      });
      return out;
    } finally {
      await session.endSession();
    }
  }

  private makeTxFacade(session: ClientSession): IDocumentTransaction {
    const self = this;
    return {
      async find<T extends BaseDocument, P = T>(
        collection: string,
        filter: DocumentFilter<T>,
        options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
      ): Promise<P[]> {
        const meta = self.meta.get(collection);
        let cursor = self.db.collection(collection).find(translateFilter<T>(filter), { session });
        const proj = translateProjection<T, P>(options?.project);
        if (proj) {cursor = cursor.project(proj);}
        if (options?.sort) {cursor = cursor.sort(translateSort(options.sort) as Sort);}
        if (options?.skip !== undefined) {cursor = cursor.skip(options.skip);}
        if (options?.limit !== undefined) {cursor = cursor.limit(options.limit);}
        const docs = await cursor.toArray();
        return docs.map((d) => fromMongo<T>(d, meta) as unknown as P);
      },
      async findById<T extends BaseDocument>(collection: string, id: string): Promise<T | null> {
        const meta = self.meta.get(collection);
        const doc = await self.db
          .collection(collection)
          .findOne(({ _id: id } as unknown) as Filter<Document>, { session });
        return fromMongo<T>(doc, meta);
      },
      async count<T extends BaseDocument>(collection: string, filter: DocumentFilter<T>): Promise<number> {
        return self.db
          .collection(collection)
          .countDocuments(translateFilter<T>(filter), { session });
      },
      async insertOne<T extends BaseDocument>(
        collection: string,
        doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
      ): Promise<T> {
        const meta = self.meta.get(collection);
        const ts = now();
        const id = randomUUID();
        const body = toMongoBody({ ...(doc as Record<string, unknown>) }, meta);
        await self.db.collection(collection).insertOne(
          { _id: id, ...body, createdAt: ts, updatedAt: ts } as never,
          { session },
        );
        return { ...(doc as object), id, createdAt: ts, updatedAt: ts } as T;
      },
      async insertMany<T extends BaseDocument>(
        collection: string,
        docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
      ): Promise<T[]> {
        if (docs.length === 0) {return [];}
        const meta = self.meta.get(collection);
        const ts = now();
        const records = docs.map((d) => ({
          _id: randomUUID(),
          ...toMongoBody({ ...(d as Record<string, unknown>) }, meta),
          createdAt: ts,
          updatedAt: ts,
        }));
        await self.db.collection(collection).insertMany(records as never[], { session, ordered: true });
        return records.map((r) => ({ ...(r as Record<string, unknown>), id: r._id })) as unknown as T[];
      },
      async updateOne<T extends BaseDocument>(
        collection: string,
        filter: DocumentFilter<T>,
        update: DocumentUpdate<T>,
        options?: { upsert?: boolean },
      ): Promise<T | null> {
        const meta = self.meta.get(collection);
        const doc = await self.db.collection(collection).findOneAndUpdate(
          translateFilter<T>(filter),
          buildUpdate<T>(update, { upsert: options?.upsert }),
          { session, upsert: options?.upsert ?? false, returnDocument: 'after' },
        );
        return fromMongo<T>(doc as Document | null, meta);
      },
      async updateMany<T extends BaseDocument>(
        collection: string,
        filter: DocumentFilter<T>,
        update: DocumentUpdate<T>,
      ): Promise<number> {
        const result = await self.db
          .collection(collection)
          .updateMany(translateFilter<T>(filter), buildUpdate<T>(update), { session });
        return result.matchedCount;
      },
      async updateById<T extends BaseDocument>(
        collection: string,
        id: string,
        update: DocumentUpdate<T>,
      ): Promise<T | null> {
        const meta = self.meta.get(collection);
        const doc = await self.db.collection(collection).findOneAndUpdate(
          ({ _id: id } as unknown) as Filter<Document>,
          buildUpdate<T>(update),
          { session, returnDocument: 'after' },
        );
        return fromMongo<T>(doc as Document | null, meta);
      },
      async deleteMany<T extends BaseDocument>(
        collection: string,
        filter: DocumentFilter<T>,
      ): Promise<number> {
        const result = await self.db
          .collection(collection)
          .deleteMany(translateFilter<T>(filter), { session });
        return result.deletedCount;
      },
      async deleteById(collection: string, id: string): Promise<boolean> {
        const result = await self.db
          .collection(collection)
          .deleteOne(({ _id: id } as unknown) as Filter<Document>, { session });
        return result.deletedCount > 0;
      },
    };
  }
}

/**
 * Factory used by the platform when loading via the adapter manifest.
 */
export function createAdapter(config: MongoDBConfig): MongoDBAdapter {
  return new MongoDBAdapter(config);
}

export default createAdapter;

// Minimal Document type alias for translateFilter return — we deliberately
// don't import Mongo's `Document` as a value to avoid runtime weight.
type Document = Record<string, unknown>;
