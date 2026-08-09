/**
 * IPC operation declarations for adapter contracts.
 *
 * TypeScript interfaces disappear at runtime, so a proxy/server pair needs a
 * checked operation inventory of its own. `defineIPCOperations<T>()` is
 * exhaustive: adding a method to `T` fails compilation until its wire mode is
 * deliberately declared here.
 */

import type { IPlatformAdapters } from '@kb-labs/core-platform';
import type { AdapterType } from '@kb-labs/core-platform/serializable';
import type { IDocumentDatabase, IKVStore } from '@kb-labs/core-platform/adapters';
import type { ITransport } from '../transport/transport.js';
import { createDocumentDatabaseProxy } from '../proxy/document-database-proxy.js';
import { createKVStoreProxy } from '../proxy/kv-store-proxy.js';

export type IPCOperationMode = 'unary' | 'stream' | 'interactive' | 'local';

export type IPCMethodNames<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends (...args: never[]) => unknown ? K : never;
}[keyof T] & string;

export type IPCOperationMap<T> = {
  [K in IPCMethodNames<T>]-?: IPCOperationMode;
};

function defineIPCOperations<T>() {
  return <const TOperations extends IPCOperationMap<T>>(
    operations: TOperations,
  ): TOperations => operations;
}

/** Complete wire inventory for `IDocumentDatabase`. */
export const documentDatabaseIPCOperations = defineIPCOperations<IDocumentDatabase>()({
  find: 'unary',
  findStream: 'stream',
  findById: 'unary',
  count: 'unary',
  insertOne: 'unary',
  insertMany: 'unary',
  updateOne: 'unary',
  updateMany: 'unary',
  updateById: 'unary',
  deleteMany: 'unary',
  deleteById: 'unary',
  bulkWrite: 'unary',
  transaction: 'interactive',
  ensureCollection: 'unary',
  ping: 'unary',
  close: 'unary',
});

export type DocumentDatabaseIPCOperation = keyof typeof documentDatabaseIPCOperations;

/** Complete wire inventory for `IKVStore`. */
export const kvStoreIPCOperations = defineIPCOperations<IKVStore>()({
  get: 'unary',
  getMany: 'unary',
  set: 'unary',
  setMany: 'unary',
  setIfNotExists: 'unary',
  delete: 'unary',
  exists: 'unary',
  cas: 'unary',
  incr: 'unary',
  ttl: 'unary',
  expire: 'unary',
  persist: 'unary',
  scan: 'stream',
  ping: 'unary',
  close: 'unary',
});

export type KVStoreIPCOperation = keyof typeof kvStoreIPCOperations;

type LegacyAdapterSlot =
  | 'logger'
  | 'analytics'
  | 'vectorStore'
  | 'llm'
  | 'embeddings'
  | 'cache'
  | 'config'
  | 'storage'
  | 'eventBus'
  | 'invoke'
  | 'artifacts'
  | 'processExecutor';

type RemoteAdapterPolicy<T> = {
  mode: 'ipc';
  adapter: AdapterType;
  operations: IPCOperationMap<NonNullable<T>>;
  proxy: (transport: ITransport) => NonNullable<T>;
};

type MigrationAdapterPolicy = {
  mode: 'migration';
  adapter: AdapterType;
  reason: string;
};

type LocalOnlyAdapterPolicy = {
  mode: 'local-only';
  reason: string;
};

type AdapterTransportPolicy<K extends keyof IPlatformAdapters> =
  K extends LegacyAdapterSlot
    ? RemoteAdapterPolicy<IPlatformAdapters[K]> | MigrationAdapterPolicy | LocalOnlyAdapterPolicy
    : RemoteAdapterPolicy<IPlatformAdapters[K]> | LocalOnlyAdapterPolicy;

type PlatformAdapterTransportPolicy = {
  [K in keyof IPlatformAdapters]-?: AdapterTransportPolicy<K>;
};

/**
 * Mandatory transport decision for every platform adapter slot.
 *
 * This is deliberately exhaustive over `IPlatformAdapters`: adding a slot
 * cannot compile until its author chooses IPC with a complete operation map,
 * or records a local-only reason. `migration` is available only to the slots
 * that predate this registry; future slots cannot use it as an escape hatch.
 */
export const platformAdapterTransportPolicy = {
  logger: {
    mode: 'migration',
    adapter: 'logger',
    reason: 'LoggerProxy is wired but still has fire-and-forget delivery semantics.',
  },
  analytics: {
    mode: 'migration',
    adapter: 'analytics',
    reason: 'Proxy platform currently supplies a noop analytics implementation.',
  },
  vectorStore: {
    mode: 'migration',
    adapter: 'vectorStore',
    reason: 'Proxy contains non-contract operations that must be removed before parity enforcement.',
  },
  llm: {
    mode: 'migration',
    adapter: 'llm',
    reason: 'Streaming currently degrades to a completion over IPC.',
  },
  embeddings: {
    mode: 'migration',
    adapter: 'embeddings',
    reason: 'The dimensions property requires out-of-band initialization in the proxy.',
  },
  cache: {
    mode: 'migration',
    adapter: 'cache',
    reason: 'Existing proxy must be moved to a checked operation inventory.',
  },
  config: {
    mode: 'migration',
    adapter: 'config',
    reason: 'Existing proxy must be moved to a checked operation inventory.',
  },
  storage: {
    mode: 'migration',
    adapter: 'storage',
    reason: 'Node streams are not serializable over the current IPC protocol.',
  },
  eventBus: {
    mode: 'migration',
    adapter: 'eventBus',
    reason: 'Subscriptions use a dedicated push-message protocol.',
  },
  invoke: {
    mode: 'migration',
    adapter: 'invoke',
    reason: 'Proxy platform currently supplies a noop invocation implementation.',
  },
  documentDatabase: {
    mode: 'ipc',
    adapter: 'database.document',
    operations: documentDatabaseIPCOperations,
    proxy: createDocumentDatabaseProxy,
  },
  kvStore: {
    mode: 'ipc',
    adapter: 'database.kv',
    operations: kvStoreIPCOperations,
    proxy: createKVStoreProxy,
  },
  logs: {
    mode: 'local-only',
    reason: 'Log queries are intentionally unavailable to worker processes.',
  },
  artifacts: {
    mode: 'migration',
    adapter: 'artifacts',
    reason: 'Artifacts have a wire route but no worker proxy yet.',
  },
  snapshotManager: {
    mode: 'local-only',
    reason: 'Snapshot lifecycle is owned by the execution host.',
  },
  notifier: {
    mode: 'local-only',
    reason: 'Notifications are emitted by the host after worker execution.',
  },
  processExecutor: {
    mode: 'migration',
    adapter: 'processExecutor',
    reason: 'Existing proxy must be moved to a checked operation inventory.',
  },
  serviceTransport: {
    mode: 'local-only',
    reason: 'Service transport is a platform-internal adapter and never enters plugin context.',
  },
} satisfies PlatformAdapterTransportPolicy;
