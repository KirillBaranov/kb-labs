/**
 * @module @kb-labs/adapters-sqlite
 *
 * SQLite-backed adapters for the two public storage contracts:
 * - `SqliteDocumentDatabase` implements `IDocumentDatabase`
 * - `SqliteKVStore`          implements `IKVStore`
 *
 * Both rely on `better-sqlite3`. They can share a single underlying file
 * (one `Database` handle, one WAL) — see `createSqliteStores` below.
 *
 * The legacy `ISQLDatabase` adapter is intentionally gone: plugins no
 * longer have access to raw SQL. Inside the platform, the migration runner
 * and other system components do their work through the document and KV
 * contracts (dogfooding).
 */

import Database from 'better-sqlite3';

import {
  SqliteDocumentDatabase,
  createSqliteDocumentDatabase,
  type SqliteDocumentConfig,
} from './document-database.js';
import {
  SqliteKVStore,
  createSqliteKVStore,
  type SqliteKVConfig,
} from './kv-store.js';

export {
  SqliteDocumentDatabase,
  createSqliteDocumentDatabase,
  type SqliteDocumentConfig,
  SqliteKVStore,
  createSqliteKVStore,
  type SqliteKVConfig,
};

export { manifest } from './manifest.js';

/**
 * Shared configuration when both Document and KV ride the same SQLite file.
 *
 * Most production deployments will want this: one connection, one WAL, no
 * duplicate sweepers, and atomic cross-collection / cross-keyspace
 * transactions become possible at the driver level (even though the public
 * contracts do not expose them — yet).
 */
export interface SqliteStoresConfig {
  filename: string;
  workspace?: { cwd: string };
  readonly?: boolean;
  wal?: boolean;
  ttlSweepIntervalMs?: number;
}

export interface SqliteStores {
  documentDatabase: SqliteDocumentDatabase;
  kvStore: SqliteKVStore;
  /** Close both adapters and the shared handle. Safe to call twice. */
  close: () => Promise<void>;
}

/**
 * Construct a Document/KV pair backed by a single sqlite file.
 *
 * The Document adapter owns the underlying handle; the KV adapter is given a
 * reuseHandle reference. `close()` here closes both and the handle itself.
 */
export function createSqliteStores(config: SqliteStoresConfig): SqliteStores {
  const docs = new SqliteDocumentDatabase(config);
  const kv = new SqliteKVStore({
    ...config,
    reuseHandle: docs.getRawHandle(),
  });
  return {
    documentDatabase: docs,
    kvStore: kv,
    async close(): Promise<void> {
      await kv.close();
      await docs.close();
    },
  };
}

/**
 * Factory used by the platform when loading via the adapter manifest.
 *
 * The manifest declares two `implements` entries — Document and KV — and
 * the runtime calls the factory for each. To keep the pair on the same
 * handle in that case we expose a third "shared" factory that the runtime
 * can detect and prefer.
 */
export function createAdapter(config: SqliteStoresConfig): SqliteStores {
  return createSqliteStores(config);
}

/**
 * Open a raw better-sqlite3 handle. Exposed for advanced setups (kb-dev,
 * snapshot tooling) that need direct access. Not part of any public
 * contract — internal users only.
 */
export function openHandle(filename: string): Database.Database {
  return new Database(filename);
}

export default createAdapter;
