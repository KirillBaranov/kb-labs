/**
 * @module @kb-labs/core-platform/noop
 *
 * Fail-loud adapter stubs + matching factory map.
 *
 * Use these for:
 * - Loader fallback when a slot is not configured AND its
 *   `ADAPTER_DEFAULTS[slot].defaultFallback === 'noop'` (LLM, embeddings,
 *   notifier, logs, snapshot manager).
 * - Strict tests that want every call to throw if a real adapter is
 *   missing.
 *
 * Honest in-memory implementations (cache, storage, document database,
 * event bus, etc.) live in `@kb-labs/core-platform/inmemory`. Programmable
 * test doubles live in `@kb-labs/shared-testing-platform/mocks`.
 */

import type { AdapterSlot } from '../adapter-defaults.js';
import type { IPlatformAdapters } from '../platform-adapters.js';

import { NoOpLLM } from './adapters/llm.js';
import { NoOpEmbeddings } from './adapters/embeddings.js';
import { NoOpNotifier } from './adapters/notifier.js';
import { NoOpLogReader } from './adapters/log-reader.js';

// ── Adapter implementations ──────────────────────────────────────────────────
export {
  NoOpAnalytics,
  NoOpConfig,
  NoOpInvoke,
  NoOpDocumentDatabase,
  NoOpKVStore,
  NoOpLLM,
  NoOpEmbeddings,
  NoOpNotifier,
  NoOpLogReader,
  NoOpLogger,
} from './adapters/index.js';

// ── Platform factory ─────────────────────────────────────────────────────────
export { createNoOpPlatform } from './noop-platform.js';

// ── Core feature implementations ─────────────────────────────────────────────
export {
  NoOpWorkflowEngine,
  NoOpJobScheduler,
  NoOpCronManager,
  NoOpResourceManager,
} from './core/index.js';

/**
 * Typed factory map: for each slot with `defaultFallback === 'noop'`,
 * a zero-arg constructor that returns a fresh NoOp stub.
 *
 * The `satisfies` clause guarantees the return type matches the contract
 * declared in `IPlatformAdapters`.
 *
 * Slots whose `defaultFallback === 'inmemory'` are absent here on purpose;
 * see `@kb-labs/core-platform/inmemory` for the matching inmemoryFactories.
 */
export const noopFactories = {
  llm:             () => new NoOpLLM(),
  embeddings:      () => new NoOpEmbeddings(),
  notifier:        () => new NoOpNotifier(),
  logs:            () => new NoOpLogReader(),
  // snapshotManager intentionally omitted — type-shape of ISnapshotManager
  // makes a generic NoOp unsafe; loader treats it as `undefined` (absent).
} satisfies Partial<{ [K in AdapterSlot]: () => IPlatformAdapters[K] }>;
