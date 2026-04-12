/**
 * @module @kb-labs/core-ipc/proxy
 *
 * Proxy adapters for cross-process platform service access.
 */

export { RemoteAdapter } from './remote-adapter.js';
export { CacheProxy } from './cache-proxy.js';
export { LLMProxy } from './llm-proxy.js';
export { EmbeddingsProxy } from './embeddings-proxy.js';
export { VectorStoreProxy } from './vector-store-proxy.js';
export { StorageProxy } from './storage-proxy.js';
export { SQLDatabaseProxy } from './sql-database-proxy.js';
export { DocumentDatabaseProxy } from './document-database-proxy.js';
export { ConfigProxy } from './config-proxy.js';
export { createProxyPlatform, type CreateProxyPlatformOptions } from './create-proxy-platform.js';
