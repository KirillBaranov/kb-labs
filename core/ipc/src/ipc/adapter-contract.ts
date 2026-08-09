/**
 * IPC operation declarations for adapter contracts.
 *
 * TypeScript interfaces disappear at runtime, so a proxy/server pair needs a
 * checked operation inventory of its own. `defineIPCOperations<T>()` is
 * exhaustive: adding a method to `T` fails compilation until its wire mode is
 * deliberately declared here.
 */

import type { IDocumentDatabase, IKVStore } from '@kb-labs/core-platform/adapters';

export type IPCOperationMode = 'unary' | 'stream' | 'interactive';

type MethodNames<T> = {
  [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never;
}[keyof T] & string;

type IPCOperationMap<T> = {
  [K in MethodNames<T>]-?: IPCOperationMode;
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
