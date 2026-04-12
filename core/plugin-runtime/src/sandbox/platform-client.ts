/**
 * Platform RPC client for subprocess
 *
 * Connects to parent process's UnixSocketServer to access platform services via RPC.
 */

import type { PlatformServices, Logger, LLMResponse } from '@kb-labs/plugin-contracts';
import { UnixSocketClient } from './unix-socket-client.js';

/**
 * Create a subprocess logger that writes to console
 */
function createSubprocessLogger(bindings: Record<string, unknown> = {}): Logger {
  const log = (level: string, msg: string, meta?: Record<string, unknown>) => {
    const mergedMeta = { ...bindings, ...(meta ?? {}) };
    const prefix = `[${level.toUpperCase()}]`;
    if (Object.keys(mergedMeta).length > 0) {
      console.log(`${prefix} ${msg}`, mergedMeta);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  };

  return {
    debug: (msg, meta?) => log('debug', msg, meta),
    info: (msg, meta?) => log('info', msg, meta),
    warn: (msg, meta?) => log('warn', msg, meta),
    error: (msg, _error?, meta?) => log('error', msg, meta),
    fatal: (msg, _error?, meta?) => log('fatal', msg, meta),
    trace: (msg, meta?) => log('trace', msg, meta),
    child: (childBindings) => createSubprocessLogger({ ...bindings, ...childBindings }),
  };
}

let rpcClient: UnixSocketClient | null = null;

/**
 * Connect to parent process platform services via Unix socket RPC
 *
 * @param socketPath Path to UnixSocketServer socket
 */
export async function connectToPlatform(socketPath?: string): Promise<PlatformServices> {
  if (!socketPath) {
    throw new Error('Socket path is required for platform RPC connection');
  }

  // Create and connect RPC client
  rpcClient = new UnixSocketClient({
    socketPath,
    authToken: process.env.KB_PLATFORM_SOCKET_TOKEN,
  });
  await rpcClient.connect();

  // Create platform services using RPC client
  const platform: PlatformServices = {
    // Logger runs in subprocess - doesn't need RPC
    logger: createSubprocessLogger(),

    // LLM service via RPC
    llm: {
      complete: async (prompt, options?) => {
        return rpcClient!.call('llm', 'complete', [prompt, options]);
      },
      stream: async function* (prompt, options?) {
        // For now, streaming falls back to complete() and yields once
        // TODO: Implement proper streaming via Unix socket
        const response = (await rpcClient!.call('llm', 'complete', [prompt, options])) as LLMResponse;
        yield response.content;
      },
    },

    // Embeddings service via RPC
    embeddings: {
      embed: async (text) => {
        return rpcClient!.call('embeddings', 'embed', [text]);
      },
      embedBatch: async (texts) => {
        return rpcClient!.call('embeddings', 'embedBatch', [texts]);
      },
      dimensions: 1536, // Default OpenAI dimensions
      getDimensions: async () => {
        return rpcClient!.call('embeddings', 'getDimensions', []);
      },
    },

    // VectorStore service via RPC
    vectorStore: {
      search: async (query, limit, filter?) => {
        return rpcClient!.call('vectorStore', 'search', [query, limit, filter]);
      },
      upsert: async (vectors) => {
        return rpcClient!.call('vectorStore', 'upsert', [vectors]);
      },
      delete: async (ids) => {
        return rpcClient!.call('vectorStore', 'delete', [ids]);
      },
      count: async () => {
        return rpcClient!.call('vectorStore', 'count', []);
      },
    },

    // Cache service via RPC
    cache: {
      get: async (key) => {
        return rpcClient!.call('cache', 'get', [key]);
      },
      set: async (key, value, ttl?) => {
        return rpcClient!.call('cache', 'set', [key, value, ttl]);
      },
      delete: async (key) => {
        return rpcClient!.call('cache', 'delete', [key]);
      },
      clear: async (pattern?) => {
        return rpcClient!.call('cache', 'clear', [pattern]);
      },
      zadd: async (key, score, member) => {
        return rpcClient!.call('cache', 'zadd', [key, score, member]);
      },
      zrangebyscore: async (key, min, max) => {
        return rpcClient!.call('cache', 'zrangebyscore', [key, min, max]);
      },
      zrem: async (key, member) => {
        return rpcClient!.call('cache', 'zrem', [key, member]);
      },
      setIfNotExists: async (key, value, ttl?) => {
        return rpcClient!.call('cache', 'setIfNotExists', [key, value, ttl]);
      },
    },

    // Storage service via RPC
    storage: {
      read: async (path) => {
        return rpcClient!.call('storage', 'read', [path]);
      },
      write: async (path, data) => {
        return rpcClient!.call('storage', 'write', [path, data]);
      },
      delete: async (path) => {
        return rpcClient!.call('storage', 'delete', [path]);
      },
      list: async (prefix) => {
        return rpcClient!.call('storage', 'list', [prefix]);
      },
      exists: async (path) => {
        return rpcClient!.call('storage', 'exists', [path]);
      },
    },

    // Analytics service via RPC
    analytics: {
      track: async (event, properties?) => {
        return rpcClient!.call('analytics', 'track', [event, properties]);
      },
      identify: async (userId, traits?) => {
        return rpcClient!.call('analytics', 'identify', [userId, traits]);
      },
      flush: async () => {
        return rpcClient!.call('analytics', 'flush', []);
      },
    },

    // EventBus service via RPC
    eventBus: {
      publish: async <T>(topic: string, event: T): Promise<void> => {
        return rpcClient!.call('eventBus', 'publish', [topic, event]);
      },
      subscribe: <T>(_topic: string, _handler: (event: T) => void | Promise<void>) => {
        // Note: Event subscriptions in subprocess are not supported yet
        // TODO: Implement proper cross-process event subscription via IPC
        console.warn(`[eventBus] Subprocess subscription is not supported yet`);
        return () => {}; // Return noop unsubscribe
      },
    },

    // Config service via RPC
    config: {
      getConfig: async (productId: string, profileId?: string) => rpcClient!.call('config', 'getConfig', [productId, profileId]),
      getRawConfig: async () => rpcClient!.call('config', 'getRawConfig', []),
    },

    // Invoke service via RPC
    invoke: {
      call: async (request: unknown) => rpcClient!.call('invoke', 'call', [request]),
      isAvailable: async (pluginId: string, command?: string) => rpcClient!.call('invoke', 'isAvailable', [pluginId, command]),
    },

    // SQL database via RPC
    sqlDatabase: {
      query: async (sql: string, params?: unknown[]) => rpcClient!.call('database.sql', 'query', [sql, params]),
      transaction: async () => rpcClient!.call('database.sql', 'transaction', []),
      close: async () => rpcClient!.call('database.sql', 'close', []),
    },

    // Document database via RPC
    documentDatabase: {
      find: async (collection: string, filter: unknown, options?: unknown) => rpcClient!.call('database.document', 'find', [collection, filter, options]),
      findById: async (collection: string, id: string) => rpcClient!.call('database.document', 'findById', [collection, id]),
      insertOne: async (collection: string, doc: unknown) => rpcClient!.call('database.document', 'insertOne', [collection, doc]),
      updateMany: async (collection: string, filter: unknown, update: unknown) => rpcClient!.call('database.document', 'updateMany', [collection, filter, update]),
      updateById: async (collection: string, id: string, update: unknown) => rpcClient!.call('database.document', 'updateById', [collection, id, update]),
      deleteMany: async (collection: string, filter: unknown) => rpcClient!.call('database.document', 'deleteMany', [collection, filter]),
      deleteById: async (collection: string, id: string) => rpcClient!.call('database.document', 'deleteById', [collection, id]),
      count: async (collection: string, filter?: unknown) => rpcClient!.call('database.document', 'count', [collection, filter]),
      close: async () => rpcClient!.call('database.document', 'close', []),
    },

    // Log reader via RPC (limited in subprocess context)
    logs: {
      query: async (filters, options?) => {
        return rpcClient!.call('logs', 'query', [filters, options]);
      },
      getById: async (id) => {
        return rpcClient!.call('logs', 'getById', [id]);
      },
      search: async (searchText, options?) => {
        return rpcClient!.call('logs', 'search', [searchText, options]);
      },
      subscribe: (_callback, _filters?) => {
        // Real-time log subscription is not supported in subprocess context
        console.warn(`[logs] Subprocess log subscription is not supported`);
        return () => {};
      },
      getStats: async () => {
        return rpcClient!.call('logs', 'getStats', []);
      },
      getCapabilities: () => {
        return { hasBuffer: false, hasPersistence: false, hasSearch: false, hasStreaming: false };
      },
    },
  };

  return platform;
}

/**
 * Disconnect from platform services
 */
export async function disconnectFromPlatform(): Promise<void> {
  if (rpcClient) {
    await rpcClient.close();
    rpcClient = null;
  }
}
