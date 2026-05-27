/**
 * @module @kb-labs/core-platform/inmemory/adapters
 *
 * Convenience barrel re-exporting each in-memory adapter class so consumers
 * can `import { InMemoryCache } from '@kb-labs/core-platform/inmemory/adapters'`
 * without depending on the factory map.
 */

export { InMemoryCache } from './cache.js';
export { InMemoryStorage } from './storage.js';
export { InMemoryEventBus } from './event-bus.js';
export { InMemoryVectorStore } from './vector-store.js';
export { InMemoryArtifacts } from './artifacts.js';
export { ConsoleLogger } from './logger.js';
export {
  InMemoryDocumentDatabase,
  createInMemoryDocumentDatabase,
  type InMemoryDocumentDatabaseOptions,
} from './document-database.js';
export { InMemoryKVStore, createInMemoryKVStore } from './kv-store.js';
export { InMemoryInvoke, type InvokeHandler } from './invoke.js';
export {
  InMemoryAnalyticsBuffer,
  type InMemoryAnalyticsBufferOptions,
} from './analytics-buffer.js';
export { InMemoryConfig } from './config.js';
