/**
 * Canonical mapping between wire-level adapter identifiers and platform slots.
 *
 * Every IPC server must resolve an adapter through this map. Keeping the
 * mapping in one place prevents one transport from silently exposing a
 * smaller adapter surface than another (for example, process IPC previously
 * omitted the document and KV database endpoints).
 */

import type { IPlatformAdapters } from '@kb-labs/core-platform';
import type { AdapterType } from '@kb-labs/core-platform/serializable';

export const IPC_ADAPTER_ROUTES = {
  vectorStore: 'vectorStore',
  cache: 'cache',
  config: 'config',
  llm: 'llm',
  embeddings: 'embeddings',
  storage: 'storage',
  logger: 'logger',
  analytics: 'analytics',
  eventBus: 'eventBus',
  invoke: 'invoke',
  artifacts: 'artifacts',
  'database.document': 'documentDatabase',
  'database.kv': 'kvStore',
  processExecutor: 'processExecutor',
} as const satisfies Record<AdapterType, keyof IPlatformAdapters>;

/** Resolve a wire adapter identifier to its configured platform adapter. */
export function resolveIPCAdapter(
  platform: IPlatformAdapters,
  adapterType: AdapterType,
): unknown {
  const slot = IPC_ADAPTER_ROUTES[adapterType];
  const adapter = platform[slot];

  if (adapter === undefined) {
    throw new Error(`Adapter '${adapterType}' is not configured for IPC`);
  }

  return adapter;
}
