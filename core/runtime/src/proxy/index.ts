/**
 * @module @kb-labs/core-runtime/proxy
 * Proxy adapters for IPC communication.
 *
 * @example
 * ```typescript
 * import {
 *   RemoteAdapter,
 *   VectorStoreProxy,
 *   CacheProxy,
 *   LLMProxy,
 *   EmbeddingsProxy,
 *   StorageProxy,
 * } from '@kb-labs/core-runtime/proxy';
 * ```
 */

export * from './remote-adapter';
export * from './vector-store-proxy';
export * from './cache-proxy';
export * from './llm-proxy';
export * from './embeddings-proxy';
export * from './storage-proxy';
export * from './sql-database-proxy';
export * from './document-database-proxy';
