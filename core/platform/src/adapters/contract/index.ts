/**
 * @module @kb-labs/core-platform/adapters/contract
 *
 * Reusable behavioural contract suites for storage adapters.
 *
 * Adapters import these from `@kb-labs/core-platform/adapters/contract` and
 * invoke them inside their own vitest setup. Importing here keeps the
 * spec-of-the-abstraction in one place — if the assertions ever differ
 * between drivers, the abstraction has leaked and must be fixed (not the
 * test).
 */

export {
  runDocumentDatabaseContract,
  type ContractFactory as DocumentDatabaseContractFactory,
} from './document-database.contract.js';

export {
  runKVStoreContract,
  type KVContractFactory,
} from './kv-store.contract.js';
