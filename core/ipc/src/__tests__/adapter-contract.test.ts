import { describe, expect, it } from 'vitest';
import type { IPlatformAdapters } from '@kb-labs/core-platform';
import type { AdapterType } from '@kb-labs/core-platform/serializable';
import {
  documentDatabaseIPCOperations,
  kvStoreIPCOperations,
} from '../ipc/adapter-contract.js';
import { IPC_ADAPTER_ROUTES, resolveIPCAdapter } from '../ipc/adapter-route.js';
import { DocumentDatabaseProxy } from '../proxy/document-database-proxy.js';
import { KVStoreProxy } from '../proxy/kv-store-proxy.js';
import type { ITransport } from '../transport/transport.js';

const transport: ITransport = {
  send: async () => {
    throw new Error('The contract-surface test must not send IPC calls');
  },
  sendMessage: () => {},
  onPushMessage: () => () => {},
  close: async () => {},
  isClosed: () => false,
};

const proxyMethods = (proxy: object): string[] => {
  return Object.getOwnPropertyNames(Object.getPrototypeOf(proxy))
    .filter((name) => name !== 'constructor' && typeof Reflect.get(proxy, name) === 'function')
    .sort();
};

describe('IPC adapter contract inventory', () => {
  it('keeps every document-database operation present on the proxy', () => {
    expect(proxyMethods(new DocumentDatabaseProxy(transport))).toEqual(
      Object.keys(documentDatabaseIPCOperations).sort(),
    );
  });

  it('keeps every KV-store operation present on the proxy', () => {
    expect(proxyMethods(new KVStoreProxy(transport))).toEqual(
      Object.keys(kvStoreIPCOperations).sort(),
    );
  });

  it('declares non-unary operations explicitly instead of silently treating them as RPC', () => {
    expect(documentDatabaseIPCOperations.findStream).toBe('stream');
    expect(documentDatabaseIPCOperations.transaction).toBe('interactive');
    expect(kvStoreIPCOperations.scan).toBe('stream');
  });
});

describe('IPC adapter routes', () => {
  it('resolves every wire adapter through the canonical route map', () => {
    const adapters = Object.fromEntries(
      Object.keys(IPC_ADAPTER_ROUTES).map((adapterType) => [adapterType, { adapterType }]),
    ) as Record<AdapterType, { adapterType: string }>;

    const platform = {
      vectorStore: adapters.vectorStore,
      cache: adapters.cache,
      config: adapters.config,
      llm: adapters.llm,
      embeddings: adapters.embeddings,
      storage: adapters.storage,
      logger: adapters.logger,
      analytics: adapters.analytics,
      eventBus: adapters.eventBus,
      invoke: adapters.invoke,
      artifacts: adapters.artifacts,
      documentDatabase: adapters['database.document'],
      kvStore: adapters['database.kv'],
      processExecutor: adapters.processExecutor,
    } as unknown as IPlatformAdapters;

    for (const adapterType of Object.keys(IPC_ADAPTER_ROUTES) as AdapterType[]) {
      expect(resolveIPCAdapter(platform, adapterType)).toBe(adapters[adapterType]);
    }
  });

  it('fails explicitly when an optional adapter is not configured', () => {
    const platform = { processExecutor: undefined } as unknown as IPlatformAdapters;

    expect(() => resolveIPCAdapter(platform, 'processExecutor')).toThrow(
      "Adapter 'processExecutor' is not configured for IPC",
    );
  });
});
