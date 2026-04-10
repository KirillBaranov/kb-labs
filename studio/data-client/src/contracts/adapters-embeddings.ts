/**
 * @module @kb-labs/studio-data-client/contracts/adapters-embeddings
 * Embeddings adapter analytics contracts
 */

/**
 * Embeddings usage statistics
 */
export interface EmbeddingsUsageStats {
  totalRequests: number;
  totalTextLength: number;
  totalCost: number;
  errors: number;
  avgDurationMs: number;
  batchRequests: number;
  singleRequests: number;
  avgBatchSize: number;
}
