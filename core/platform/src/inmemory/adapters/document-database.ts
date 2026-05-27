/**
 * @module @kb-labs/core-platform/inmemory/adapters/document-database
 *
 * In-memory `IDocumentDatabase` for tests. Lives in `core-platform` (lowest
 * layer) so any consumer of the contract can use it without pulling in a real
 * driver and without creating a build-graph cycle.
 *
 * Scope: behavioural fidelity sufficient for governance / wrapper tests —
 * CRUD, filters, updates, atomic bulkWrite, transactions, ensureCollection,
 * unique indexes. Not optimised, not for production. Sweep-based TTL is
 * intentionally absent (not exercised by the governance suite).
 */

import type {
  BaseDocument,
  BulkOp,
  BulkResult,
  DocumentFilter,
  DocumentUpdate,
  EnsureCollectionOpts,
  FilterOperators,
  FindOptions,
  IDocumentDatabase,
  IDocumentTransaction,
  IndexSpec,
  ProjectOpts,
  Projection,
  SignalOpts,
} from '../../adapters/database.js';

interface Collection {
  docs: Map<string, BaseDocument>;
  indexes: IndexSpec[];
}

function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clone<T>(value: T): T {
  return value === undefined || value === null
    ? value
    : (JSON.parse(JSON.stringify(value)) as T);
}

function matchScalar<V>(value: V, ops: FilterOperators<V> | V): boolean {
  if (ops === null || ops === undefined || typeof ops !== 'object') {
    return value === ops;
  }
  const o = ops as FilterOperators<V>;
  if ('$eq' in o && o.$eq !== undefined && value !== o.$eq) { return false; }
  if ('$ne' in o && o.$ne !== undefined && value === o.$ne) { return false; }
  if ('$gt' in o && o.$gt !== undefined && !(value as never > (o.$gt as never))) { return false; }
  if ('$gte' in o && o.$gte !== undefined && !(value as never >= (o.$gte as never))) { return false; }
  if ('$lt' in o && o.$lt !== undefined && !(value as never < (o.$lt as never))) { return false; }
  if ('$lte' in o && o.$lte !== undefined && !(value as never <= (o.$lte as never))) { return false; }
  if ('$in' in o && Array.isArray(o.$in) && !o.$in.includes(value as never)) { return false; }
  if ('$nin' in o && Array.isArray(o.$nin) && o.$nin.includes(value as never)) { return false; }
  if ('$exists' in o && typeof o.$exists === 'boolean') {
    const present = value !== undefined;
    if (present !== o.$exists) { return false; }
  }
  if ('$startsWith' in o && typeof o.$startsWith === 'string') {
    if (typeof value !== 'string' || !value.startsWith(o.$startsWith)) { return false; }
  }
  if ('$contains' in o && typeof o.$contains === 'string') {
    if (typeof value !== 'string' || !value.includes(o.$contains)) { return false; }
  }
  if ('$endsWith' in o && typeof o.$endsWith === 'string') {
    if (typeof value !== 'string' || !value.endsWith(o.$endsWith)) { return false; }
  }
  return true;
}

function matchFilter<T extends BaseDocument>(
  doc: T,
  filter: DocumentFilter<T>,
): boolean {
  const source = doc as unknown as Record<string, unknown>;
  if (filter.$and && Array.isArray(filter.$and)) {
    if (!filter.$and.every((f) => matchFilter(doc, f as DocumentFilter<T>))) { return false; }
  }
  if (filter.$or && Array.isArray(filter.$or)) {
    if (!filter.$or.some((f) => matchFilter(doc, f as DocumentFilter<T>))) { return false; }
  }
  for (const key of Object.keys(filter)) {
    if (key === '$and' || key === '$or') { continue; }
    const fieldValue = source[key];
    const expectation = (filter as Record<string, unknown>)[key];
    if (!matchScalar(fieldValue, expectation as never)) { return false; }
  }
  return true;
}

function applyUpdate<T extends BaseDocument>(
  doc: T,
  update: DocumentUpdate<T>,
): T {
  const next: Record<string, unknown> = { ...(doc as unknown as Record<string, unknown>) };
  if (update.$set) {
    for (const [k, v] of Object.entries(update.$set)) { next[k] = v; }
  }
  if (update.$unset) {
    for (const k of Object.keys(update.$unset)) { delete next[k]; }
  }
  if (update.$inc) {
    for (const [k, delta] of Object.entries(update.$inc)) {
      const current = typeof next[k] === 'number' ? (next[k] as number) : 0;
      if (typeof delta !== 'number' || !Number.isFinite(delta)) {
        throw new Error(`$inc value for "${k}" must be a finite number`);
      }
      next[k] = current + delta;
    }
  }
  next.updatedAt = Date.now();
  return next as T;
}

function applyProjection<T, P>(
  doc: T,
  projection: Projection<T> | undefined,
): P {
  if (!projection) { return doc as unknown as P; }
  const entries = Object.entries(projection) as Array<[keyof T, 0 | 1]>;
  const includes = entries.filter(([, v]) => v === 1).map(([k]) => k);
  const excludes = entries.filter(([, v]) => v === 0).map(([k]) => k);
  if (includes.length > 0 && excludes.length > 0) {
    throw new Error('projection cannot mix include (1) and exclude (0)');
  }
  const source = doc as unknown as Record<string, unknown>;
  if (includes.length > 0) {
    const out: Record<string, unknown> = {};
    for (const k of includes as string[]) {
      out[k] = source[k];
    }
    return out as P;
  }
  const out: Record<string, unknown> = { ...source };
  for (const k of excludes as string[]) { delete out[k]; }
  return out as P;
}

function sortDocs<T extends BaseDocument>(docs: T[], sort?: Record<string, 1 | -1>): T[] {
  if (!sort) { return docs; }
  const entries = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      if (av === bv) { continue; }
      const cmp = (av as never) < (bv as never) ? -1 : 1;
      return dir === 1 ? cmp : -cmp;
    }
    return 0;
  });
}

function checkUniqueIndexes<T extends BaseDocument>(
  collection: Collection,
  doc: T,
  ignoreId?: string,
): void {
  for (const idx of collection.indexes) {
    if (!idx.unique) { continue; }
    const paths = Array.isArray(idx.path) ? idx.path : [idx.path];
    const newKey = paths.map((p) => JSON.stringify((doc as unknown as Record<string, unknown>)[p])).join('|');
    for (const existing of collection.docs.values()) {
      if (ignoreId !== undefined && existing.id === ignoreId) { continue; }
      const existingKey = paths.map((p) => JSON.stringify((existing as unknown as Record<string, unknown>)[p])).join('|');
      if (existingKey === newKey) {
        throw new Error(`unique index violation on [${paths.join(', ')}]`);
      }
    }
  }
}

export interface InMemoryDocumentDatabaseOptions {
  /** Seed clock value for new documents. Defaults to `Date.now()` at call site. */
  now?: () => number;
}

/**
 * In-memory `IDocumentDatabase` for tests.
 *
 * Storage layout: `Map<collectionName, Collection>`. Each `Collection` holds
 * a `Map<id, doc>` and a list of declared indexes (used for uniqueness checks).
 */
export class InMemoryDocumentDatabase implements IDocumentDatabase {
  private readonly collections = new Map<string, Collection>();
  private readonly now: () => number;
  private closed = false;

  constructor(opts: InMemoryDocumentDatabaseOptions = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  private getCollection(name: string): Collection {
    let c = this.collections.get(name);
    if (!c) {
      c = { docs: new Map(), indexes: [] };
      this.collections.set(name, c);
    }
    return c;
  }

  private throwIfClosed(): void {
    if (this.closed) { throw new Error('InMemoryDocumentDatabase is closed'); }
  }

  async ensureCollection(name: string, options?: EnsureCollectionOpts): Promise<void> {
    this.throwIfClosed();
    const c = this.getCollection(name);
    if (options?.indexes) {
      for (const idx of options.indexes) {
        const paths = Array.isArray(idx.path) ? idx.path.join(',') : idx.path;
        const exists = c.indexes.some((existing) => {
          const existingPaths = Array.isArray(existing.path) ? existing.path.join(',') : existing.path;
          return existingPaths === paths;
        });
        if (!exists) { c.indexes.push(idx); }
      }
    }
  }

  async find<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
  ): Promise<P[]> {
    this.throwIfClosed();
    const c = this.getCollection(collection);
    let docs = Array.from(c.docs.values()) as T[];
    docs = docs.filter((d) => matchFilter(d, filter));
    docs = sortDocs(docs, options?.sort);
    if (options?.skip) { docs = docs.slice(options.skip); }
    if (options?.limit !== undefined) { docs = docs.slice(0, options.limit); }
    return docs.map((d) => applyProjection<T, P>(clone(d), options?.project as Projection<T> | undefined));
  }

  findStream<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts & { batchSize?: number },
  ): AsyncIterable<P> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        const results = await self.find<T, P>(collection, filter, options);
        for (const r of results) { yield r; }
      },
    };
  }

  async findById<T extends BaseDocument>(
    collection: string,
    id: string,
  ): Promise<T | null> {
    this.throwIfClosed();
    const doc = this.getCollection(collection).docs.get(id);
    return doc ? clone(doc as T) : null;
  }

  async count<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    this.throwIfClosed();
    const docs = Array.from(this.getCollection(collection).docs.values()) as T[];
    return docs.filter((d) => matchFilter(d, filter)).length;
  }

  async insertOne<T extends BaseDocument>(
    collection: string,
    doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<T> {
    this.throwIfClosed();
    const c = this.getCollection(collection);
    const now = this.now();
    const full = { ...(doc as object), id: nextId(), createdAt: now, updatedAt: now } as T;
    checkUniqueIndexes(c, full);
    c.docs.set(full.id, clone(full));
    return clone(full);
  }

  async insertMany<T extends BaseDocument>(
    collection: string,
    docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<T[]> {
    this.throwIfClosed();
    // Atomic: stage everything, only commit if all pass uniqueness.
    const c = this.getCollection(collection);
    const now = this.now();
    const staged: T[] = [];
    for (const d of docs) {
      const full = { ...(d as object), id: nextId(), createdAt: now, updatedAt: now } as T;
      checkUniqueIndexes(c, full);
      // also reject duplicates within the batch:
      for (const s of staged) {
        try { checkUniqueIndexes({ docs: new Map([[s.id, s]]), indexes: c.indexes }, full); } catch (e) { throw e; }
      }
      staged.push(full);
    }
    for (const s of staged) { c.docs.set(s.id, clone(s)); }
    return staged.map(clone);
  }

  async updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts & { upsert?: boolean },
  ): Promise<T | null> {
    this.throwIfClosed();
    const c = this.getCollection(collection);
    for (const existing of c.docs.values()) {
      if (matchFilter(existing as T, filter)) {
        const next = applyUpdate(existing as T, update);
        checkUniqueIndexes(c, next, existing.id);
        c.docs.set(existing.id, clone(next));
        return clone(next);
      }
    }
    if (options?.upsert) {
      const now = this.now();
      const seed: Record<string, unknown> = { id: nextId(), createdAt: now, updatedAt: now };
      // Seed with literal fields from filter that look like equality
      for (const [k, v] of Object.entries(filter)) {
        if (k === '$and' || k === '$or') { continue; }
        if (v !== null && typeof v === 'object') { continue; }
        seed[k] = v;
      }
      const next = applyUpdate(seed as T, update);
      checkUniqueIndexes(c, next);
      c.docs.set(next.id, clone(next));
      return clone(next);
    }
    return null;
  }

  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
  ): Promise<number> {
    this.throwIfClosed();
    const c = this.getCollection(collection);
    let n = 0;
    for (const existing of c.docs.values()) {
      if (matchFilter(existing as T, filter)) {
        const next = applyUpdate(existing as T, update);
        checkUniqueIndexes(c, next, existing.id);
        c.docs.set(existing.id, clone(next));
        n++;
      }
    }
    return n;
  }

  async updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
  ): Promise<T | null> {
    this.throwIfClosed();
    const c = this.getCollection(collection);
    const existing = c.docs.get(id);
    if (!existing) { return null; }
    const next = applyUpdate(existing as T, update);
    checkUniqueIndexes(c, next, id);
    c.docs.set(id, clone(next));
    return clone(next);
  }

  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    this.throwIfClosed();
    const c = this.getCollection(collection);
    let n = 0;
    for (const [id, doc] of c.docs) {
      if (matchFilter(doc as T, filter)) {
        c.docs.delete(id);
        n++;
      }
    }
    return n;
  }

  async deleteById(collection: string, id: string): Promise<boolean> {
    this.throwIfClosed();
    return this.getCollection(collection).docs.delete(id);
  }

  async bulkWrite<T extends BaseDocument>(
    collection: string,
    ops: Array<BulkOp<T>>,
  ): Promise<BulkResult> {
    this.throwIfClosed();
    // Atomic: snapshot the collection, apply ops, rollback on any failure.
    const c = this.getCollection(collection);
    const snapshot = new Map(c.docs);
    const result: BulkResult = { inserted: 0, updated: 0, deleted: 0 };
    try {
      for (const op of ops) {
        if (op.type === 'insert') {
          await this.insertOne(collection, op.doc);
          result.inserted++;
        } else if (op.type === 'update') {
          const target = await this.updateOne(collection, op.filter, op.update, { upsert: op.upsert });
          if (target) { result.updated++; }
        } else {
          result.deleted += await this.deleteMany(collection, op.filter);
        }
      }
      return result;
    } catch (err) {
      c.docs.clear();
      for (const [k, v] of snapshot) { c.docs.set(k, v); }
      throw err;
    }
  }

  async transaction<T>(fn: (tx: IDocumentTransaction) => Promise<T>): Promise<T> {
    this.throwIfClosed();
    // Snapshot all collections so we can roll back if `fn` throws.
    const snapshot = new Map<string, Map<string, BaseDocument>>();
    for (const [name, c] of this.collections) {
      snapshot.set(name, new Map(c.docs));
    }
    const tx: IDocumentTransaction = {
      find: this.find.bind(this),
      findById: this.findById.bind(this),
      count: this.count.bind(this),
      insertOne: this.insertOne.bind(this),
      insertMany: this.insertMany.bind(this),
      updateOne: this.updateOne.bind(this),
      updateMany: this.updateMany.bind(this),
      updateById: this.updateById.bind(this),
      deleteMany: this.deleteMany.bind(this),
      deleteById: this.deleteById.bind(this),
    };
    try {
      return await fn(tx);
    } catch (err) {
      // Roll back.
      for (const [name, docs] of snapshot) {
        const c = this.collections.get(name);
        if (c) { c.docs.clear(); for (const [k, v] of docs) { c.docs.set(k, v); } }
      }
      throw err;
    }
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: !this.closed, latencyMs: 0 };
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export function createInMemoryDocumentDatabase(
  opts?: InMemoryDocumentDatabaseOptions,
): InMemoryDocumentDatabase {
  return new InMemoryDocumentDatabase(opts);
}
