/**
 * @module @kb-labs/core-platform/noop/adapters
 * NoOp and in-memory adapter implementations.
 */

export { NoOpAnalytics } from './analytics.js';
export { MemoryVectorStore } from './vector-store.js';
export { MockLLM } from './llm.js';
export { MockEmbeddings } from './embeddings.js';
export { MemoryCache } from './cache.js';
export { NoOpConfig } from './config.js';
export { MemoryStorage } from './storage.js';
export { ConsoleLogger, NoOpLogger } from './logger.js';
export { MemoryEventBus, NoOpEventBus } from './event-bus.js';
export { NoOpInvoke } from './invoke.js';
export { MemoryArtifacts } from './artifacts.js';
export {
  NoOpSQLDatabase,
  NoOpDocumentDatabase,
  NoOpKVDatabase,
  NoOpTimeSeriesDatabase,
  NoOpDatabaseProvider,
} from './database.js';
