/**
 * @module @kb-labs/core-platform/noop/adapters
 *
 * NoOp adapter implementations — fail-loud stubs for slots where no
 * honest in-process fallback is possible. Selected by the loader when
 * the slot is not configured AND `ADAPTER_DEFAULTS[slot].defaultFallback === 'noop'`.
 *
 * Honest in-memory implementations (cache, storage, etc.) have moved to
 * `@kb-labs/core-platform/inmemory`. Programmable test doubles (MockLLM,
 * MockEmbeddings) move to `@kb-labs/shared-testing-platform/mocks` — they
 * are re-exported here only until consumers migrate, then deleted.
 */

// ── True NoOp adapters (throw / silent / empty) ─────────────────────────────
export { NoOpAnalytics } from './analytics.js';
export { NoOpConfig } from './config.js';
export { NoOpInvoke } from './invoke.js';
export { NoOpDocumentDatabase, NoOpKVStore } from './database.js';
export { NoOpLLM } from './llm.js';
export { NoOpEmbeddings } from './embeddings.js';
export { NoOpNotifier } from './notifier.js';
export { NoOpLogReader } from './log-reader.js';
export { NoOpLogger } from './logger.js';

// ── DEPRECATED RE-EXPORTS (will be removed after consumer migration) ────────
// In-memory impls — now live in `@kb-labs/core-platform/inmemory`.
export { MemoryCache } from './cache.js';
export { MemoryStorage } from './storage.js';
export { MemoryVectorStore } from './vector-store.js';
export { MemoryEventBus, NoOpEventBus } from './event-bus.js';
export { MemoryArtifacts } from './artifacts.js';
export { ConsoleLogger } from './logger.js';
// Mocks — will move to `@kb-labs/shared-testing-platform/mocks`.
export { MockLLM } from './llm.js';
export { MockEmbeddings } from './embeddings.js';
