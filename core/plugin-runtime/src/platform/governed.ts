/**
 * Governed Platform Services
 *
 * Wraps raw platform services with permission checks.
 * Used in both devMode (in-process) and subprocess mode.
 */

import type {
  PlatformServices,
  PermissionSpec,
  VectorRecord,
  VectorFilter,
  LLMAdapter,
  EmbeddingsAdapter,
  VectorStoreAdapter,
  CacheAdapter,
  StorageAdapter,
} from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';
import type { INotifier } from '@kb-labs/core-platform';

/**
 * Check if cache key matches allowed namespaces
 */
function checkCacheNamespace(
  key: string,
  permission: boolean | string[] | { namespaces?: string[] } | undefined
): void {
  if (permission === false || permission === undefined) {
    throw new PermissionError('Cache access denied');
  }

  if (permission === true) {
    return; // All namespaces allowed
  }

  // Support both string[] (from shared-perm-presets builder) and { namespaces: string[] }
  const allowed = Array.isArray(permission)
    ? permission
    : (permission as { namespaces?: string[] }).namespaces ?? [];

  // Check if key starts with any allowed namespace
  // Note: namespaces already include trailing ':' (e.g., 'git-status:')
  const hasMatch = allowed.some((ns) => key.startsWith(ns));

  if (!hasMatch) {
    throw new PermissionError(
      `Cache key '${key}' not allowed. Permitted namespaces: ${allowed.join(', ')}`
    );
  }
}

/**
 * Check if storage path is within allowed paths
 */
function checkStoragePath(
  path: string,
  permission: boolean | { paths?: string[] } | undefined
): void {
  if (permission === false || permission === undefined) {
    throw new PermissionError('Storage access denied');
  }

  if (permission === true) {
    return; // All paths allowed
  }

  const allowed = (permission as { paths?: string[] }).paths ?? [];

  // Check if path starts with any allowed base path
  const hasMatch = allowed.some((basePath) => path.startsWith(basePath));

  if (!hasMatch) {
    throw new PermissionError(
      `Storage path '${path}' not allowed. Permitted paths: ${allowed.join(', ')}`
    );
  }
}

/**
 * Check if vector ID matches allowed namespaces and add prefix
 * Returns the prefixed ID
 */
function prefixVectorId(id: string, permission: string[] | boolean | undefined): string {
  if (permission === false || permission === undefined) {
    throw new PermissionError('VectorStore access denied');
  }

  if (permission === true) {
    return id; // No prefix needed, full access
  }

  // Get first allowed namespace as prefix (plugins typically have one namespace)
  const allowed = permission as string[];
  if (allowed.length === 0) {
    throw new PermissionError('VectorStore access denied: no namespaces configured');
  }

  const namespace = allowed[0]!;

  // If ID already has the prefix, don't add it again
  if (id.startsWith(namespace)) {
    return id;
  }

  // Add namespace prefix
  return `${namespace}${id}`;
}


/**
 * Create denied service stub that throws on ANY property access
 */
function createDeniedService<T>(serviceName: string): T {
  return new Proxy({}, {
    get() {
      throw new PermissionError(`Platform service '${serviceName}' access denied`);
    },
  }) as unknown as T;
}

/**
 * Wrap raw platform services with permission checks.
 *
 * @param raw - Raw platform services
 * @param permissions - Plugin permissions spec
 * @param pluginId - Plugin ID for logger child context
 * @returns Governed platform services with permission enforcement
 */
export function createGovernedPlatformServices(
  raw: PlatformServices,
  permissions: PermissionSpec,
  pluginId: string
): PlatformServices {
  return {
    // Logger: always allowed, create child logger with plugin context
    logger: raw.logger.child({ plugin: pluginId }),

    // LLM: check permission and proxy ILLM interface (complete, stream, chatWithTools)
    llm: permissions.platform?.llm
      ? {
          complete: async (prompt, options) => {
            // Optional: check model whitelist
            const allowedModels =
              typeof permissions.platform?.llm === 'object'
                ? (permissions.platform.llm as { models?: string[] }).models
                : undefined;

            if (allowedModels && options?.model && !allowedModels.includes(options.model)) {
              throw new PermissionError(
                `LLM model '${options.model}' not allowed. Permitted models: ${allowedModels.join(', ')}`
              );
            }

            return raw.llm.complete(prompt, options);
          },
          stream: async function* (prompt, options) {
            // Optional: check model whitelist
            const allowedModels =
              typeof permissions.platform?.llm === 'object'
                ? (permissions.platform.llm as { models?: string[] }).models
                : undefined;

            if (allowedModels && options?.model && !allowedModels.includes(options.model)) {
              throw new PermissionError(
                `LLM model '${options.model}' not allowed. Permitted models: ${allowedModels.join(', ')}`
              );
            }

            yield* raw.llm.stream(prompt, options);
          },
          ...(raw.llm.chatWithTools
            ? {
                chatWithTools: async (messages, options) => {
                  return raw.llm.chatWithTools!(messages, options);
                },
              }
            : {}),
        }
      : createDeniedService<LLMAdapter>('llm'),

    // Embeddings: binary permission with proper interface
    embeddings: permissions.platform?.embeddings
      ? {
          embed: (text) => raw.embeddings.embed(text),
          embedBatch: (texts) => raw.embeddings.embedBatch(texts),
          get dimensions() {
            return raw.embeddings.dimensions;
          },
          getDimensions: () => raw.embeddings.getDimensions(),
        }
      : createDeniedService<EmbeddingsAdapter>('embeddings'),

    // VectorStore: namespace-based permission (prefix isolation)
    vectorStore: permissions.platform?.vectorStore
      ? (() => {
          const rawPermission = permissions.platform?.vectorStore;
          const permission =
            rawPermission === true
              ? true
              : typeof rawPermission === 'object'
                ? (rawPermission as { collections?: string[] }).collections
                : undefined;

          // Namespace for this plugin (e.g. 'mind:'), undefined when permission === true
          const namespace: string | undefined =
            permission === true || !permission || permission.length === 0
              ? undefined
              : permission[0];

          // Filter results by _kbNamespace metadata field (set on upsert).
          // Falls back to allowing results that have no _kbNamespace (backward compat).
          const filterByNamespace = <T extends { metadata?: Record<string, unknown> }>(
            results: T[],
          ): T[] => {
            if (!namespace) { return results; }
            return results.filter(
              (r) => !r.metadata?.['_kbNamespace'] || r.metadata['_kbNamespace'] === namespace,
            );
          };

          return {
            search: async (query: number[], limit: number, filter?: VectorFilter) => {
              const results = await raw.vectorStore.search(query, limit, filter);
              return filterByNamespace(results);
            },

            upsert: async (vectors: VectorRecord[]) => {
              const prefixedVectors = vectors.map((vec) => ({
                ...vec,
                id: prefixVectorId(vec.id, permission),
                // Tag with namespace so search/query can filter correctly.
                // Underlying adapters (e.g. Qdrant) convert IDs to UUIDs, so
                // string-prefix checks on IDs are unreliable after the round-trip.
                metadata: namespace
                  ? { ...vec.metadata, _kbNamespace: namespace }
                  : vec.metadata,
              }));
              return raw.vectorStore.upsert(prefixedVectors);
            },

            delete: async (ids: string[]) => {
              const prefixedIds = ids.map((id) => prefixVectorId(id, permission));
              return raw.vectorStore.delete(prefixedIds);
            },

            count: async () => raw.vectorStore.count(),

            ...(raw.vectorStore.query
              ? {
                  query: async (filter: VectorFilter) => {
                    const results = await raw.vectorStore.query!(filter);
                    return filterByNamespace(results);
                  },
                }
              : {}),
          } as VectorStoreAdapter;
        })()
      : createDeniedService<VectorStoreAdapter>('vectorStore'),

    // Cache: namespace-based permission
    cache: permissions.platform?.cache
      ? {
          get: async (key) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.get(key);
          },
          set: async (key, value, ttl) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.set(key, value, ttl);
          },
          delete: async (key) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.delete(key);
          },
          clear: async (pattern) => {
            if (permissions.platform?.cache !== true) {
              throw new PermissionError('Cache.clear() requires full cache permission');
            }
            return raw.cache.clear(pattern);
          },
          // Sorted set operations
          zadd: async (key, score, member) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.zadd(key, score, member);
          },
          zrangebyscore: async (key, min, max) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.zrangebyscore(key, min, max);
          },
          zrem: async (key, member) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.zrem(key, member);
          },
          // Atomic operations
          setIfNotExists: async (key, value, ttl) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.setIfNotExists(key, value, ttl);
          },
        }
      : createDeniedService<CacheAdapter>('cache'),

    // Storage: path-based permission
    storage: permissions.platform?.storage
      ? {
          read: async (path) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.read(path);
          },
          write: async (path, data) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.write(path, data);
          },
          delete: async (path) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.delete(path);
          },
          exists: async (path) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.exists(path);
          },
          list: async (prefix) => {
            checkStoragePath(prefix, permissions.platform?.storage);
            return raw.storage.list(prefix);
          },
        }
      : createDeniedService<StorageAdapter>('storage'),

    // Analytics: always allowed (like logger)
    analytics: raw.analytics,

    // EventBus: always allowed (no permission check currently)
    eventBus: raw.eventBus,

    // Notifier: requires explicit permission declaration.
    // emit: source is always overwritten with pluginId — plugin cannot fake its origin.
    // subscribe: declared sources/severities are a hard ceiling enforced here,
    //   regardless of whatever filter the plugin passes at runtime.
    //   sources: ['*'] = explicit wildcard (all sources).
    notifier: (() => {
      const perm = permissions.platform?.notifier;
      if (!perm || !raw.notifier) {
        return raw.notifier
          ? createDeniedService<INotifier>('notifier')
          : undefined;
      }

      const canEmit = perm.emit === true;
      const subPerm = perm.subscribe;
      const wildcardSources = subPerm?.sources.includes('*') ?? false;
      const allowedSources: string[] | undefined = wildcardSources ? undefined : subPerm?.sources;
      const allowedSeverity = subPerm?.severity;

      return {
        notify: canEmit
          ? (event: Parameters<INotifier['notify']>[0]) =>
              raw.notifier!.notify({ ...event, source: pluginId })
          : () => Promise.reject(new PermissionError('Notifier emit access denied')),

        subscribe: subPerm
          ? (filter, handler) => {
              return raw.notifier!.subscribe(filter, async (event) => {
                // Enforce declared scope as hard ceiling.
                if (allowedSources && !allowedSources.includes(event.source ?? '')) { return; }
                if (allowedSeverity && !allowedSeverity.includes(event.severity ?? 'info')) { return; }
                await handler(event);
              });
            }
          : () => { throw new PermissionError('Notifier subscribe access denied'); },
      } satisfies INotifier;
    })(),

    // Logs: pass through (system-level, restricted by runtime context)
    logs: raw.logs,

    // Config: pass through (governed by platform, not plugin permissions)
    config: raw.config,

    // Invoke: pass through (cross-plugin invocation)
    invoke: raw.invoke,

    // SQL database: pass through
    sqlDatabase: raw.sqlDatabase,

    // Document database: pass through
    documentDatabase: raw.documentDatabase,
  };
}
