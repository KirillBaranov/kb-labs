/**
 * @module @kb-labs/adapters-sqlite/__tests__/contract
 *
 * Runs the platform-wide contract suites against the sqlite-backed
 * implementations of `IDocumentDatabase` and `IKVStore`.
 *
 * If any of these tests fails after a code change in `document-database.ts`
 * or `kv-store.ts`, the implementation has diverged from the abstraction —
 * fix the driver, not the test. If the divergence cannot be fixed cheaply,
 * the contract itself was probably too ambitious; that is a conversation
 * to have in `core/platform`, not here.
 */

import {
  runDocumentDatabaseContract,
  runKVStoreContract,
} from '@kb-labs/core-platform/adapters/contract';

import {
  createSqliteDocumentDatabase,
  createSqliteKVStore,
} from '../index.js';

runDocumentDatabaseContract({
  name: 'sqlite (in-memory)',
  createInstance: async () =>
    createSqliteDocumentDatabase({
      filename: ':memory:',
      ttlSweepIntervalMs: 0,
    }),
});

runKVStoreContract({
  name: 'sqlite (in-memory)',
  createInstance: async () =>
    createSqliteKVStore({
      filename: ':memory:',
      ttlSweepIntervalMs: 0,
    }),
});
