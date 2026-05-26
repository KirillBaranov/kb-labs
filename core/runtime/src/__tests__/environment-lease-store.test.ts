/**
 * Behavioural tests for `EnvironmentLeaseStore`.
 *
 * Backed by an inline in-memory `IDocumentDatabase` fake — we don't depend
 * on a real sqlite driver here because pulling `@kb-labs/adapters-sqlite`
 * as a devDep of core/runtime would close the cycle
 * `core-runtime → adapters-sqlite → sdk → core-runtime`.
 *
 * The fake implements just enough of the document contract for the lease
 * store's needs: scalar filters with `$and`/`$eq`/`$lte`, `updateOne` with
 * upsert, `insertOne` with unique-index enforcement, `find` with sort/limit,
 * and `deleteMany` (used by `beforeEach`-style cleanup). The store's actual
 * driver-level behaviour is covered by the shared
 * `runDocumentDatabaseContract` suite that runs against every adapter.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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
  BulkOp,
  BulkResult,
} from '@kb-labs/core-platform/adapters';
import { EnvironmentLeaseStore } from '../environment-lease-store.js';

interface UniqueIndex {
  paths: string[];
}

class InMemoryDocumentDatabase implements IDocumentDatabase {
  private readonly collections = new Map<string, Map<string, Record<string, unknown>>>();
  private readonly uniqueIndexes = new Map<string, UniqueIndex[]>();

  async ensureCollection(name: string, opts?: EnsureCollectionOpts): Promise<void> {
    if (!this.collections.has(name)) {this.collections.set(name, new Map());}
    if (!this.uniqueIndexes.has(name)) {this.uniqueIndexes.set(name, []);}
    for (const idx of opts?.indexes ?? []) {
      if (!idx.unique) {continue;}
      const paths = Array.isArray(idx.path) ? idx.path : [idx.path];
      this.uniqueIndexes.get(name)!.push({ paths });
    }
  }

  async insertOne<T extends BaseDocument>(
    collection: string,
    doc: Omit<T, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<T> {
    const ts = Date.now();
    const id = randomUUID();
    const record = { ...(doc as Record<string, unknown>), id, createdAt: ts, updatedAt: ts };
    this.enforceUnique(collection, record);
    this.getCol(collection).set(id, record);
    return record as unknown as T;
  }

  async insertMany<T extends BaseDocument>(
    collection: string,
    docs: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<T[]> {
    const out: T[] = [];
    for (const d of docs) {out.push(await this.insertOne<T>(collection, d));}
    return out;
  }

  async find<T extends BaseDocument, P = T>(
    collection: string,
    filter: DocumentFilter<T>,
    options?: FindOptions & ProjectOpts<T, P> & SignalOpts,
  ): Promise<P[]> {
    let rows = Array.from(this.getCol(collection).values()).filter((r) => matches(r, filter as DocumentFilter<unknown>));
    if (options?.sort) {
      const entries = Object.entries(options.sort);
      rows = rows.sort((a, b) => {
        for (const [k, dir] of entries) {
          const av = (a as Record<string, unknown>)[k];
          const bv = (b as Record<string, unknown>)[k];
          if (av === bv) {continue;}
          if (av === undefined) {return 1;}
          if (bv === undefined) {return -1;}
          return ((av as number) < (bv as number) ? -1 : 1) * dir;
        }
        return 0;
      });
    }
    if (options?.skip) {rows = rows.slice(options.skip);}
    if (options?.limit !== undefined) {rows = rows.slice(0, options.limit);}
    return rows as unknown as P[];
  }

  async updateOne<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
    options?: SignalOpts & { upsert?: boolean },
  ): Promise<T | null> {
    const col = this.getCol(collection);
    for (const row of col.values()) {
      if (matches(row, filter as DocumentFilter<unknown>)) {
        const updated = applyUpdate(row, update as DocumentUpdate<unknown>);
        col.set(updated.id as string, updated);
        return updated as T;
      }
    }
    if (!options?.upsert) {return null;}
    const ts = Date.now();
    const id = randomUUID();
    const seed = synthesise(filter);
    const next: Record<string, unknown> = {
      ...seed,
      ...(update.$set ?? {}),
      id,
      createdAt: ts,
      updatedAt: ts,
    };
    this.enforceUnique(collection, next);
    col.set(id, next);
    return next as T;
  }

  async updateMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
    update: DocumentUpdate<T>,
  ): Promise<number> {
    let count = 0;
    const col = this.getCol(collection);
    for (const row of Array.from(col.values())) {
      if (matches(row, filter as DocumentFilter<unknown>)) {
        col.set(row.id as string, applyUpdate(row, update as DocumentUpdate<unknown>));
        count++;
      }
    }
    return count;
  }

  async updateById<T extends BaseDocument>(
    collection: string,
    id: string,
    update: DocumentUpdate<T>,
  ): Promise<T | null> {
    return this.updateOne<T>(collection, { id: { $eq: id } } as DocumentFilter<T>, update);
  }

  async deleteMany<T extends BaseDocument>(
    collection: string,
    filter: DocumentFilter<T>,
  ): Promise<number> {
    let count = 0;
    const col = this.getCol(collection);
    for (const [id, row] of Array.from(col.entries())) {
      if (matches(row, filter as DocumentFilter<unknown>)) {
        col.delete(id);
        count++;
      }
    }
    return count;
  }

  async deleteById(collection: string, id: string): Promise<boolean> {
    return this.getCol(collection).delete(id);
  }

  async findById<T extends BaseDocument>(collection: string, id: string): Promise<T | null> {
    return (this.getCol(collection).get(id) as T) ?? null;
  }

  async count<T extends BaseDocument>(collection: string, filter: DocumentFilter<T>): Promise<number> {
    return (await this.find<T>(collection, filter)).length;
  }

  // The rest of IDocumentDatabase — unused by EnvironmentLeaseStore but
  // required to satisfy the interface. They throw so misuse surfaces loud.
  // eslint-disable-next-line require-yield
  async *findStream<T extends BaseDocument, P = T>(
    _c: string,
    _f: DocumentFilter<T>,
    _options?: FindOptions & ProjectOpts<T, P> & SignalOpts & { batchSize?: number },
  ): AsyncIterable<P> {
    throw new Error('findStream not implemented in test fake');
  }
  async bulkWrite<T extends BaseDocument>(_c: string, _ops: Array<BulkOp<T>>): Promise<BulkResult> {
    throw new Error('bulkWrite not implemented in test fake');
  }
  async transaction<T>(fn: (tx: IDocumentTransaction) => Promise<T>): Promise<T> {
    return fn(this as unknown as IDocumentTransaction);
  }
  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 0 };
  }
  async close(): Promise<void> { /* nothing */ }

  private getCol(name: string): Map<string, Record<string, unknown>> {
    let col = this.collections.get(name);
    if (!col) { col = new Map(); this.collections.set(name, col); }
    return col;
  }

  private enforceUnique(collection: string, row: Record<string, unknown>): void {
    const indexes = this.uniqueIndexes.get(collection) ?? [];
    for (const idx of indexes) {
      for (const existing of this.getCol(collection).values()) {
        if (existing.id === row.id) {continue;}
        if (idx.paths.every((p) => existing[p] === row[p])) {
          throw new Error(`unique index violation on ${idx.paths.join('+')}`);
        }
      }
    }
  }
}

const matches = (row: Record<string, unknown>, filter: DocumentFilter<unknown>): boolean => {
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and') {
      if (!(value as DocumentFilter<unknown>[]).every((sub) => matches(row, sub))) {return false;}
      continue;
    }
    if (key === '$or') {
      if (!(value as DocumentFilter<unknown>[]).some((sub) => matches(row, sub))) {return false;}
      continue;
    }
    const cell = row[key];
    if (value === null || value === undefined) {
      if (cell !== null && cell !== undefined) {return false;}
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as FilterOperators<unknown>;
      if ('$eq' in ops && cell !== ops.$eq) {return false;}
      if ('$ne' in ops && cell === ops.$ne) {return false;}
      if ('$lt' in ops && !(typeof cell === typeof ops.$lt && (cell as number | string) < (ops.$lt as number | string))) {return false;}
      if ('$lte' in ops && !(typeof cell === typeof ops.$lte && (cell as number | string) <= (ops.$lte as number | string))) {return false;}
      if ('$gt' in ops && !(typeof cell === typeof ops.$gt && (cell as number | string) > (ops.$gt as number | string))) {return false;}
      if ('$gte' in ops && !(typeof cell === typeof ops.$gte && (cell as number | string) >= (ops.$gte as number | string))) {return false;}
      if ('$in' in ops && !(ops.$in as unknown[]).includes(cell)) {return false;}
      if ('$nin' in ops && (ops.$nin as unknown[]).includes(cell)) {return false;}
      if ('$exists' in ops && (cell !== undefined) !== ops.$exists) {return false;}
      continue;
    }
    if (cell !== value) {return false;}
  }
  return true;
};

const applyUpdate = (
  row: Record<string, unknown>,
  update: DocumentUpdate<unknown>,
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...row, updatedAt: Date.now() };
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
    for (const [k, n] of Object.entries(update.$inc)) {
      if (k === 'id' || k === 'createdAt' || k === 'updatedAt') {continue;}
      const existing = next[k];
      next[k] = typeof existing === 'number' ? existing + (n as number) : (n as number);
    }
  }
  return next;
};

const synthesise = <T>(filter: DocumentFilter<T>): Record<string, unknown> => {
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
// Tests
// ────────────────────────────────────────────────────────────────────────────

describe('EnvironmentLeaseStore (document-backed)', () => {
  let docs: InMemoryDocumentDatabase;
  let store: EnvironmentLeaseStore;

  beforeEach(async () => {
    docs = new InMemoryDocumentDatabase();
    store = new EnvironmentLeaseStore(docs);
    await store.ensureSchema();
  });

  afterEach(async () => {
    await docs.close();
  });

  it('upserts a lease and round-trips through findExpiredActiveLeases', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await store.upsertLease({
      environmentId: 'env-1',
      runId: 'run-1',
      status: 'active',
      provider: 'docker-cli',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
      expiresAt: past,
      metadataJson: '{"k":"v"}',
    });

    const expired = await store.findExpiredActiveLeases(new Date().toISOString());
    expect(expired).toHaveLength(1);
    expect(expired[0]?.environmentId).toBe('env-1');
    expect(expired[0]?.runId).toBe('run-1');
    expect(expired[0]?.metadataJson).toBe('{"k":"v"}');
  });

  it('upsert replaces an existing lease rather than duplicating it', async () => {
    const base = {
      environmentId: 'env-1',
      status: 'active' as const,
      provider: 'docker-cli',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await store.upsertLease(base);
    await store.upsertLease({ ...base, runId: 'run-2', status: 'terminated' });

    const expired = await store.findExpiredActiveLeases(
      new Date(Date.now() + 120_000).toISOString(),
    );
    expect(expired).toHaveLength(0);
  });

  it('markTerminated flips status', async () => {
    await store.upsertLease({
      environmentId: 'env-1',
      status: 'active',
      provider: 'docker-cli',
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await store.markTerminated('env-1', new Date().toISOString(), 'shutdown');

    const stillActive = await store.findExpiredActiveLeases(
      new Date(Date.now() + 120_000).toISOString(),
    );
    expect(stillActive).toHaveLength(0);
  });

  it('appendEvent rejects duplicate ids (unique index on eventId)', async () => {
    await store.appendEvent({
      id: 'e-1',
      environmentId: 'env-1',
      type: 'environment.started',
      at: new Date().toISOString(),
    });
    await expect(
      store.appendEvent({
        id: 'e-1',
        environmentId: 'env-1',
        type: 'environment.terminated',
        at: new Date().toISOString(),
      }),
    ).rejects.toThrow();
  });

  it('ensureSchema is idempotent — repeated calls do not throw', async () => {
    await expect(store.ensureSchema()).resolves.not.toThrow();
    await expect(store.ensureSchema()).resolves.not.toThrow();
  });
});
