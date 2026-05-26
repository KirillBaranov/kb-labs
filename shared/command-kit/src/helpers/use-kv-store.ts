/**
 * @module @kb-labs/shared-command-kit/helpers/use-kv-store
 *
 * Hook for the per-plugin durable key-value store.
 *
 * Unlike `useCache`, KV is the source of truth — entries persist until
 * explicitly deleted or until their TTL expires. Use it for sessions,
 * distributed locks, idempotency keys, counters — anything where losing
 * the entry is a bug.
 *
 * Keys are namespaced under `<pluginId>:` transparently. Two plugins
 * setting `"counter"` do not collide. `scan` only yields the calling
 * plugin's own keys.
 *
 * @example
 * ```typescript
 * import { useKVStore } from '@kb-labs/shared-command-kit';
 *
 * async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
 *   const kv = useKVStore();
 *   if (!kv) throw new Error('KV store not configured');
 *
 *   const token = crypto.randomUUID();
 *   const acquired = await kv.setIfNotExists(`lock:${name}`, token, { ttlMs: 30_000 });
 *   if (!acquired) throw new Error('lock held');
 *
 *   try {
 *     return await fn();
 *   } finally {
 *     // Release only if we still hold the token (cas guards against ttl-takeover).
 *     await kv.cas(`lock:${name}`, token, null);
 *   }
 * }
 * ```
 */

import type { IKVStore } from '@kb-labs/core-platform';
import { usePlatform } from './use-platform.js';

/**
 * Resolve the KV store for the current execution.
 *
 * Returns `undefined` only when no adapter is wired at all. A plugin
 * that didn't declare `permissions.platform.database.kvStore` still gets
 * an instance — every method throws `PermissionError` on use.
 */
export function useKVStore(): IKVStore | undefined {
  const platform = usePlatform();
  return platform.kvStore;
}

/**
 * Cheap check used to gate optional features. Note that it returns true
 * even when the plugin lacks `permissions.platform.database.kvStore` —
 * the runtime will replace the adapter with a deny stub in that case, so
 * this check tells you "is the slot wired?", not "can I actually use it?".
 */
export function isKVStoreAvailable(): boolean {
  return useKVStore() !== undefined;
}
