/**
 * State API implementation
 */

import type { StateAPI, CacheAdapter } from '@kb-labs/plugin-contracts';

export interface CreateStateAPIOptions {
  pluginId: string;
  tenantId?: string;
  cache: CacheAdapter;
}

/**
 * Create StateAPI with tenant-aware key prefixing
 */
export function createStateAPI(options: CreateStateAPIOptions): StateAPI {
  const { pluginId, tenantId, cache } = options;

  // Create prefixed key: tenant:plugin:key
  function prefixKey(key: string): string {
    const tenant = tenantId ?? 'default';
    return `${tenant}:${pluginId}:${key}`;
  }

  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      const value = await cache.get<T>(prefixKey(key));
      return value ?? undefined;
    },

    async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
      await cache.set(prefixKey(key), value, ttlMs);
    },

    async delete(key: string): Promise<void> {
      await cache.delete(prefixKey(key));
    },

    async has(key: string): Promise<boolean> {
      const value = await cache.get(prefixKey(key));
      return value !== null && value !== undefined;
    },

    async getMany<T = unknown>(keys: string[]): Promise<Map<string, T>> {
      const result = new Map<string, T>();
      await Promise.all(
        keys.map(async key => {
          const value = await cache.get<T>(prefixKey(key));
          if (value !== null && value !== undefined) {
            result.set(key, value);
          }
        })
      );
      return result;
    },

    async setMany<T = unknown>(
      entries: Map<string, T> | Record<string, T>,
      ttlMs?: number
    ): Promise<void> {
      const entriesArray = entries instanceof Map
        ? Array.from(entries.entries())
        : Object.entries(entries);

      await Promise.all(
        entriesArray.map(([key, value]) =>
          cache.set(prefixKey(key), value, ttlMs)
        )
      );
    },
  };
}
