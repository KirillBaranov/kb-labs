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
} from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

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
 * Remove namespace prefix from vector ID
 * Returns the unprefixed ID for plugin consumption
 */
function unprefixVectorId(id: string, permission: string[] | boolean | undefined): string {
  if (permission === true) {
    return id; // No prefix to remove
  }

  const allowed = permission as string[];
  if (allowed.length === 0) {
    return id;
  }

  const namespace = allowed[0]!;

  // Remove prefix if present
  if (id.startsWith(namespace)) {
    return id.slice(namespace.length);
  }

  return id;
}

/**
 * Check if vector ID belongs to allowed namespace (for search results)
 */
function isVectorIdAllowed(id: string, permission: string[] | boolean | undefined): boolean {
  if (permission === true) {
    return true; // All IDs allowed
  }

  const allowed = permission as string[];
  if (allowed.length === 0) {
    return false;
  }

  // Check if ID starts with any allowed namespace
  return allowed.some((ns) => id.startsWith(ns));
}

/**
 * Create denied service stub that throws on ANY property access
 */
function createDeniedService(serviceName: string): any {
  return new Proxy({}, {
    get() {
      throw new PermissionError(`Platform service '${serviceName}' access denied`);
    },
  });
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

    // LLM: check permission and proxy ILLM interface (complete, stream)
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
        }
      : (createDeniedService('llm') as any),

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
      : (createDeniedService('embeddings') as any),

    // VectorStore: namespace-based permission (prefix isolation)
    vectorStore: permissions.platform?.vectorStore
      ? {
          search: async (query: number[], limit: number, filter?: VectorFilter) => {
            // Search in raw store
            const results = await raw.vectorStore.search(query, limit, filter);

            // Extract collections array from permission
            const rawPermission = permissions.platform?.vectorStore;
            const permission =
              rawPermission === true
                ? true
                : typeof rawPermission === 'object'
                  ? (rawPermission as { collections?: string[] }).collections
                  : undefined;

            // Filter results to only include allowed namespaces and remove prefix
            return results
              .filter((result) => isVectorIdAllowed(result.id, permission))
              .map((result) => ({
                ...result,
                id: unprefixVectorId(result.id, permission),
              }));
          },

          upsert: async (vectors: VectorRecord[]) => {
            // Extract collections array from permission
            const rawPermission = permissions.platform?.vectorStore;
            const permission =
              rawPermission === true
                ? true
                : typeof rawPermission === 'object'
                  ? (rawPermission as { collections?: string[] }).collections
                  : undefined;

            // Add namespace prefix to all IDs
            const prefixedVectors = vectors.map((vec) => ({
              ...vec,
              id: prefixVectorId(vec.id, permission),
            }));

            return raw.vectorStore.upsert(prefixedVectors);
          },

          delete: async (ids: string[]) => {
            // Extract collections array from permission
            const rawPermission = permissions.platform?.vectorStore;
            const permission =
              rawPermission === true
                ? true
                : typeof rawPermission === 'object'
                  ? (rawPermission as { collections?: string[] }).collections
                  : undefined;

            // Add namespace prefix to all IDs
            const prefixedIds = ids.map((id) => prefixVectorId(id, permission));

            return raw.vectorStore.delete(prefixedIds);
          },

          count: async () => {
            // Count all vectors and filter by namespace
            // Note: This is not perfect - it counts all vectors in the store
            // A better implementation would filter by prefix at DB level
            // For now, this is a limitation of the simple wrapper approach
            return raw.vectorStore.count();
          },
        }
      : (createDeniedService('vectorStore') as any),

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
      : (createDeniedService('cache') as any),

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
      : (createDeniedService('storage') as any),

    // Analytics: always allowed (like logger)
    analytics: raw.analytics,

    // EventBus: always allowed (no permission check currently)
    eventBus: raw.eventBus,

    // Logs: pass through (system-level, restricted by runtime context)
    logs: raw.logs,
  };
}
