/**
 * @module @kb-labs/core-platform/noop/noop-platform
 * Factory for a mixed fallback platform object.
 *
 * Slots with an honest in-process implementation (cache, storage, etc.)
 * are wired with InMemory* variants so the process can function without
 * external infrastructure. Slots that require a real provider (llm,
 * embeddings) are wired with NoOp* stubs that throw `AdapterUnavailableError`
 * on use — failing loudly rather than silently returning garbage.
 *
 * Use in:
 * - Worker subprocess fallback (no IPC socket available)
 * - Tests that need lightweight platform wiring without a real adapter
 *
 * @example
 * import { createNoOpPlatform } from '@kb-labs/core-platform/noop';
 * const platform = createNoOpPlatform();
 */

import { ConsoleLogger } from '../inmemory/adapters/logger.js';
import { InMemoryCache } from '../inmemory/adapters/cache.js';
import { InMemoryVectorStore } from '../inmemory/adapters/vector-store.js';
import { InMemoryStorage } from '../inmemory/adapters/storage.js';
import { InMemoryEventBus } from '../inmemory/adapters/event-bus.js';
import { InMemoryAnalyticsBuffer } from '../inmemory/adapters/analytics-buffer.js';
import { NoOpLLM } from './adapters/llm.js';
import { NoOpEmbeddings } from './adapters/embeddings.js';
import { NoOpLogReader } from './adapters/log-reader.js';

export function createNoOpPlatform() {
  return {
    logger:      new ConsoleLogger(),
    llm:         new NoOpLLM(),
    cache:       new InMemoryCache(),
    embeddings:  new NoOpEmbeddings(),
    vectorStore: new InMemoryVectorStore(),
    storage:     new InMemoryStorage(),
    analytics:   new InMemoryAnalyticsBuffer(),
    eventBus:    new InMemoryEventBus(),
    logs:        new NoOpLogReader(),
  };
}
