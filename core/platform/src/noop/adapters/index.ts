/**
 * @module @kb-labs/core-platform/noop/adapters
 *
 * NoOp adapter implementations — fail-loud stubs for slots where no
 * honest in-process fallback is possible. Selected by the loader when
 * the slot is not configured AND `ADAPTER_DEFAULTS[slot].defaultFallback === 'noop'`.
 *
 * Honest in-memory implementations (cache, storage, etc.) live in
 * `@kb-labs/core-platform/inmemory`. Programmable test doubles live in
 * `@kb-labs/shared-testing` (mockLLM, MockEmbeddings).
 */

export { NoOpAnalytics } from './analytics.js';
export { NoOpConfig } from './config.js';
export { NoOpInvoke } from './invoke.js';
export { NoOpDocumentDatabase, NoOpKVStore } from './database.js';
export { NoOpLLM } from './llm.js';
export { NoOpEmbeddings } from './embeddings.js';
export { NoOpNotifier } from './notifier.js';
export { NoOpLogReader } from './log-reader.js';
export { NoOpLogger } from './logger.js';
