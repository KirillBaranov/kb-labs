/**
 * @module @kb-labs/core-runtime/transport/timeout-config
 * Declarative timeout configuration for adapter operations.
 *
 * Different adapter operations have different performance characteristics:
 * - Fast operations (cache, simple queries): 5-30s
 * - Medium operations (embeddings, search): 30-60s
 * - Slow operations (bulk upsert, batch embeddings): 60-180s
 *
 * These timeouts account for:
 * 1. Network latency (Unix Socket is fast, but operation itself may be slow)
 * 2. Backend processing time (Qdrant upsert, OpenAI API calls)
 * 3. Safety margin (P95 latency + buffer)
 *
 * @example
 * ```typescript
 * import { getOperationTimeout } from './timeout-config';
 *
 * const timeout = getOperationTimeout('vectorStore', 'upsert');
 * // Returns 120000 (2 minutes)
 * ```
 */

/**
 * Timeout configuration map.
 * Key format: "adapter.method" or "adapter.*" for wildcard.
 */
export const OPERATION_TIMEOUTS: Record<string, number> = {
  // === VectorStore operations ===
  // Bulk upsert is slow (Qdrant indexing overhead)
  'vectorStore.upsert': 120_000, // 2 minutes

  // Search operations - medium latency
  'vectorStore.search': 30_000, // 30 seconds
  'vectorStore.hybridSearch': 45_000, // 45 seconds (BM25 + vector)

  // Bulk retrieval - potentially large result sets
  'vectorStore.get': 120_000, // 2 minutes (retrieving many vectors)
  'vectorStore.query': 120_000, // 2 minutes (metadata filtering + retrieval)

  // Collection management - fast
  'vectorStore.createCollection': 15_000,
  'vectorStore.deleteCollection': 15_000,
  'vectorStore.collectionExists': 5_000,

  // === Embeddings operations ===
  // Single embed - OpenAI API latency
  'embeddings.embed': 30_000, // 30 seconds

  // Batch embeddings - OpenAI processes in parallel, but may rate limit
  'embeddings.embedBatch': 120_000, // 2 minutes

  // Dimension check - fast property access
  'embeddings.getDimensions': 5_000,

  // === LLM operations ===
  // Text generation - depends on output length
  'llm.generate': 90_000, // 1.5 minutes
  'llm.generateStream': 120_000, // 2 minutes (streaming may take longer)

  // === Cache operations ===
  // Cache is fast (Redis or in-memory)
  'cache.get': 5_000,
  'cache.set': 5_000,
  'cache.delete': 5_000,
  'cache.clear': 10_000,
  'cache.has': 5_000,

  // === Storage operations ===
  // File I/O - medium latency
  'storage.read': 15_000,
  'storage.write': 30_000,
  'storage.delete': 10_000,
  'storage.exists': 5_000,
  'storage.list': 20_000,

  // === Wildcard defaults ===
  // Default timeout for any vectorStore operation not listed above
  'vectorStore.*': 60_000,

  // Default timeout for any embeddings operation
  'embeddings.*': 60_000,

  // Default timeout for any LLM operation
  'llm.*': 90_000,

  // Default timeout for any cache operation
  'cache.*': 10_000,

  // Default timeout for any storage operation
  'storage.*': 30_000,

  // === Global fallback ===
  // Used when no specific rule matches
  '*': 30_000, // 30 seconds default
};

/**
 * Get timeout for a specific adapter operation.
 *
 * Priority:
 * 1. Explicit "adapter.method" match
 * 2. Wildcard "adapter.*" match
 * 3. Global "*" fallback
 *
 * @param adapter - Adapter name (e.g., "vectorStore", "embeddings")
 * @param method - Method name (e.g., "upsert", "search")
 * @returns Timeout in milliseconds
 *
 * @example
 * ```typescript
 * getOperationTimeout('vectorStore', 'upsert'); // 120000
 * getOperationTimeout('vectorStore', 'unknownMethod'); // 60000 (wildcard)
 * getOperationTimeout('unknownAdapter', 'unknownMethod'); // 30000 (fallback)
 * ```
 */
export function getOperationTimeout(adapter: string, method: string): number {
  // Try exact match first
  const exactKey = `${adapter}.${method}`;
  if (exactKey in OPERATION_TIMEOUTS) {
    return OPERATION_TIMEOUTS[exactKey]!;
  }

  // Try adapter wildcard
  const wildcardKey = `${adapter}.*`;
  if (wildcardKey in OPERATION_TIMEOUTS) {
    return OPERATION_TIMEOUTS[wildcardKey]!;
  }

  // Global fallback
  return OPERATION_TIMEOUTS['*']!;
}

/**
 * Get timeout for an adapter call with priority chain:
 * 1. Explicit call.timeout (highest priority)
 * 2. Config timeout from transport
 * 3. Operation-specific timeout
 * 4. Global fallback (lowest priority)
 *
 * @param call - Adapter call with optional timeout
 * @param configTimeout - Transport-level default timeout
 * @returns Final timeout to use in milliseconds
 *
 * @example
 * ```typescript
 * // Explicit timeout takes priority
 * selectTimeout({ adapter: 'vectorStore', method: 'upsert', timeout: 60000 }, 30000);
 * // Returns 60000
 *
 * // Config timeout takes priority over operation timeout
 * selectTimeout({ adapter: 'vectorStore', method: 'upsert' }, 90000);
 * // Returns 90000
 *
 * // Operation timeout used when no explicit override
 * selectTimeout({ adapter: 'vectorStore', method: 'upsert' }, undefined);
 * // Returns 120000
 * ```
 */
export function selectTimeout(
  call: { adapter: string; method: string; timeout?: number },
  configTimeout?: number
): number {
  // Priority 1: Explicit call timeout
  if (call.timeout !== undefined) {
    return call.timeout;
  }

  // Priority 2: Transport config timeout
  if (configTimeout !== undefined) {
    return configTimeout;
  }

  // Priority 3: Operation-specific timeout
  return getOperationTimeout(call.adapter, call.method);
}
