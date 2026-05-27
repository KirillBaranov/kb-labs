/**
 * @module @kb-labs/core-platform/inmemory
 *
 * Honest in-process implementations of platform adapters.
 *
 * Used by the loader as the default fallback when a slot is not
 * configured (and `ADAPTER_DEFAULTS[slot].defaultFallback === 'inmemory'`).
 * Each implementation behaves correctly within a single process; data is
 * lost on restart. Cross-process consumers should configure a real
 * adapter (sqlite, redis, etc.).
 *
 * Production-grade by intent: every method is implemented honestly. Not a
 * test mock — those live in `@kb-labs/shared-testing-platform/mocks`.
 */

import type { AdapterSlot } from '../adapter-defaults.js';
import type { IPlatformAdapters } from '../platform-adapters.js';

import { InMemoryCache } from './adapters/cache.js';
import { InMemoryStorage } from './adapters/storage.js';
import { InMemoryEventBus } from './adapters/event-bus.js';
import { InMemoryVectorStore } from './adapters/vector-store.js';
import { InMemoryArtifacts } from './adapters/artifacts.js';
import { ConsoleLogger } from './adapters/logger.js';
import { InMemoryDocumentDatabase } from './adapters/document-database.js';
import { InMemoryKVStore } from './adapters/kv-store.js';
import { InMemoryInvoke } from './adapters/invoke.js';
import { InMemoryAnalyticsBuffer } from './adapters/analytics-buffer.js';
import { InMemoryConfig } from './adapters/config.js';

export { InMemoryCache } from './adapters/cache.js';
export { InMemoryStorage } from './adapters/storage.js';
export { InMemoryEventBus } from './adapters/event-bus.js';
export { InMemoryVectorStore } from './adapters/vector-store.js';
export { InMemoryArtifacts } from './adapters/artifacts.js';
export { ConsoleLogger } from './adapters/logger.js';
export {
  InMemoryDocumentDatabase,
  createInMemoryDocumentDatabase,
  type InMemoryDocumentDatabaseOptions,
} from './adapters/document-database.js';
export {
  InMemoryKVStore,
  createInMemoryKVStore,
} from './adapters/kv-store.js';
export {
  InMemoryInvoke,
  type InvokeHandler,
} from './adapters/invoke.js';
export {
  InMemoryAnalyticsBuffer,
  type InMemoryAnalyticsBufferOptions,
} from './adapters/analytics-buffer.js';
export { InMemoryConfig } from './adapters/config.js';

/**
 * Typed factory map: for each slot with `defaultFallback === 'inmemory'`,
 * a zero-arg constructor that returns a fresh in-memory implementation.
 *
 * The `satisfies` clause guarantees the return type matches the contract
 * declared in `IPlatformAdapters` — if a contract is widened, the
 * factory fails to compile until updated.
 *
 * Slots whose `defaultFallback === 'noop'` are absent here on purpose;
 * see `@kb-labs/core-platform/noop` for the matching noopFactories.
 */
export const inmemoryFactories = {
  cache:            () => new InMemoryCache(),
  storage:          () => new InMemoryStorage(),
  eventBus:         () => new InMemoryEventBus(),
  vectorStore:      () => new InMemoryVectorStore(),
  artifacts:        () => new InMemoryArtifacts(),
  logger:           () => new ConsoleLogger(),
  documentDatabase: () => new InMemoryDocumentDatabase(),
  kvStore:          () => new InMemoryKVStore(),
  invoke:           () => new InMemoryInvoke(),
  analytics:        () => new InMemoryAnalyticsBuffer(),
  config:           () => new InMemoryConfig(),
} satisfies Partial<{ [K in AdapterSlot]: () => IPlatformAdapters[K] }>;
