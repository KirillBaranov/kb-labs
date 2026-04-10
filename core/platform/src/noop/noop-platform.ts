/**
 * @module @kb-labs/core-platform/noop/noop-platform
 * Factory for a fully no-op platform object.
 *
 * Assembles all existing no-op adapter implementations into a single object
 * that satisfies PlatformServices (plugin-contracts) structurally.
 *
 * Use in:
 * - Worker subprocess fallback (no IPC socket available)
 * - Tests that don't need real platform services
 *
 * @example
 * import { createNoOpPlatform } from '@kb-labs/core-platform/noop';
 * const platform = createNoOpPlatform();
 */

import { NoOpLogger } from './adapters/logger.js';
import { MockLLM } from './adapters/llm.js';
import { MemoryCache } from './adapters/cache.js';
import { MockEmbeddings } from './adapters/embeddings.js';
import { MemoryVectorStore } from './adapters/vector-store.js';
import { MemoryStorage } from './adapters/storage.js';
import { NoOpAnalytics } from './adapters/analytics.js';
import { NoOpEventBus } from './adapters/event-bus.js';
import type { ILogReader, LogCapabilities } from '../adapters/log-reader.js';

const noOpLogReader: ILogReader = {
  query: async () => ({ logs: [], total: 0, hasMore: false, source: 'buffer' as const }),
  getById: async () => null,
  search: async () => ({ logs: [], total: 0, hasMore: false }),
  subscribe: () => () => {},
  getStats: async () => ({}),
  getCapabilities: (): LogCapabilities => ({
    hasBuffer: false,
    hasPersistence: false,
    hasSearch: false,
    hasStreaming: false,
  }),
};

export function createNoOpPlatform() {
  return {
    logger: new NoOpLogger(),
    llm: new MockLLM(),
    cache: new MemoryCache(),
    embeddings: new MockEmbeddings(),
    vectorStore: new MemoryVectorStore(),
    storage: new MemoryStorage(),
    analytics: new NoOpAnalytics(),
    eventBus: new NoOpEventBus(),
    logs: noOpLogReader,
  };
}
