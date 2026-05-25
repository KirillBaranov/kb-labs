/**
 * @module @kb-labs/adapters-sqlite/manifest
 *
 * Adapter manifest for the SQLite storage pair.
 *
 * The package ships both a document database and a KV store on top of a
 * shared `better-sqlite3` handle. The platform registers them as the
 * `documentDatabase` and `kvStore` services respectively — see
 * `createSqliteStores` in `index.ts`.
 */

import type { AdapterManifest } from '@kb-labs/sdk/adapters';

export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'sqlite-stores',
  name: 'SQLite Document + KV',
  version: '2.0.0',
  description:
    'Embedded sqlite-backed storage pair: IDocumentDatabase and IKVStore, sharing a single file and connection.',
  author: 'KB Labs Team',
  license: 'KBPL-1.1',
  type: 'core',
  // Two roles served from one driver. Older runtimes that expect a string
  // see the first entry; updated registry handles the array.
  implements: ['IDocumentDatabase', 'IKVStore'] as unknown as string,
  contexts: ['workspace'],
  capabilities: {
    transactions: true,
    batch: true,
    custom: {
      json: true,
      ttl: true,
      indexes: true,
    },
  },
  configSchema: {
    filename: {
      type: 'string',
      description: 'Database file path (use :memory: for in-memory database)',
    },
    readonly: {
      type: 'boolean',
      default: false,
      description: 'Open database in readonly mode',
    },
    ttlSweepIntervalMs: {
      type: 'number',
      default: 30000,
      description: 'Background TTL sweep interval (ms). 0 disables the sweeper.',
    },
  },
};
