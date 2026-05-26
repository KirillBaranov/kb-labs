/**
 * @module @kb-labs/core-platform/adapters/testing
 *
 * Test-only in-memory implementations of the storage contracts.
 * Use these in unit tests that need a real `IDocumentDatabase` / `IKVStore`
 * but cannot pull in a real driver (cycle risk, install time, etc).
 *
 * Not for production.
 */

export {
  InMemoryDocumentDatabase,
  createInMemoryDocumentDatabase,
  type InMemoryDocumentDatabaseOptions,
} from './in-memory-document-database.js';

export { InMemoryKVStore, createInMemoryKVStore } from './in-memory-kv-store.js';
