/**
 * @module @kb-labs/core-ipc/proxy/create-proxy-platform
 *
 * Create IPlatformAdapters with proxy adapters for cross-process execution.
 * All adapters forward calls to parent process via IPC transport.
 *
 * Returns IPlatformAdapters (strict type) — TypeScript enforces every field is present.
 * Adding a new adapter to IPlatformAdapters will break the build here until a proxy is added.
 */

import type { ITransport } from '../transport/transport.js';
import type { IPlatformAdapters } from '@kb-labs/core-platform';
import type { ILogger } from '@kb-labs/core-platform/adapters';
import { CacheProxy } from './cache-proxy.js';
import { LLMProxy } from './llm-proxy.js';
import { EmbeddingsProxy } from './embeddings-proxy.js';
import { VectorStoreProxy } from './vector-store-proxy.js';
import { StorageProxy } from './storage-proxy.js';
import { DocumentDatabaseProxy } from './document-database-proxy.js';
import { KVStoreProxy } from './kv-store-proxy.js';
import { ConfigProxy } from './config-proxy.js';
import { EventBusProxy } from './event-bus-proxy.js';
import { LoggerProxy } from './logger-proxy.js';
import { PolicyProxy } from './policy-proxy.js';

export interface CreateProxyPlatformOptions {
  /**
   * Transport for IPC communication (IPCTransport, UnixSocketTransport, etc.)
   */
  transport: ITransport;

  /**
   * Override logger for the child process. Defaults to a LoggerProxy that
   * forwards calls to the parent host's real logger (pino) over IPC, so
   * `useLogger()` inside worker-pool code surfaces in host logs with all
   * correlation fields. Override only for tests or specialized embedders.
   */
  logger?: ILogger;
}

/**
 * Create platform adapters with proxy implementations.
 *
 * All adapters forward calls to the parent process via the provided transport.
 * Logger is local (noop by default) — never proxied.
 *
 * @returns IPlatformAdapters with strict type checking.
 * If IPlatformAdapters gains a new field, this function won't compile until updated.
 */
export function createProxyPlatform(
  options: CreateProxyPlatformOptions
): IPlatformAdapters {
  const { transport } = options;
  const logger = options.logger ?? new LoggerProxy(transport);

  // Proxy adapters — forward all calls via transport
  const cache = new CacheProxy(transport);
  const llm = new LLMProxy(transport);
  const embeddings = new EmbeddingsProxy(transport);
  const vectorStore = new VectorStoreProxy(transport);
  const storage = new StorageProxy(transport);
  const documentDatabase = new DocumentDatabaseProxy(transport);
  const kvStore = new KVStoreProxy(transport);
  const config = new ConfigProxy(transport);

  // EventBus: bidirectional proxy — subscribe/publish across process boundary
  const eventBus = new EventBusProxy(transport);

  // Policy: forward authorization decisions to the parent's single PDP instance.
  const policy = new PolicyProxy(transport);

  // Analytics: noop (low priority for proxying)
  const analytics = {
    track: async () => {},
    identify: async () => {},
    flush: async () => {},
  };

  // Invoke: noop (cross-plugin invocation not yet proxied)
  const invoke = {
    call: async () => ({ success: false, error: 'Invoke not available in proxy context' }),
    isAvailable: async () => false,
  };

  // Logs: noop (read-only, low priority for proxying)
  const logs = {
    query: async () => ({ logs: [] as never[], total: 0, hasMore: false, source: 'buffer' as const }),
    getById: async () => null,
    search: async () => ({ logs: [] as never[], total: 0, hasMore: false }),
    subscribe: () => () => {},
    getStats: async () => ({}),
    getCapabilities: () => ({ hasBuffer: false, hasPersistence: false, hasSearch: false, hasStreaming: false }),
  };

  // Return strict IPlatformAdapters — compile error if field missing
  return {
    logger,
    llm,
    embeddings,
    vectorStore,
    cache,
    storage,
    analytics,
    eventBus,
    config,
    invoke,
    documentDatabase,
    kvStore,
    logs,
    policy,
  } satisfies IPlatformAdapters;
}
