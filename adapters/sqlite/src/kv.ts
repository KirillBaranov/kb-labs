/**
 * @module @kb-labs/adapters-sqlite/kv
 *
 * Subpath entry that registers the SQLite KV store. Configure it with the
 * same `filename` you give the main entry — the underlying handle is
 * deduplicated by path so both adapters share a single WAL.
 */

import { createSqliteKVStore, SqliteKVStore, type SqliteKVConfig } from './kv-store.js';

export { SqliteKVStore, createSqliteKVStore, type SqliteKVConfig };

export function createAdapter(config: SqliteKVConfig): SqliteKVStore {
  return createSqliteKVStore(config);
}

export default createAdapter;
