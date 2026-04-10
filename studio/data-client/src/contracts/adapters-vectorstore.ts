/**
 * @module @kb-labs/studio-data-client/contracts/adapters-vectorstore
 * VectorStore adapter analytics contracts
 */

/**
 * VectorStore usage statistics
 */
export interface VectorStoreUsageStats {
  searchQueries: number;
  upsertOperations: number;
  deleteOperations: number;
  avgSearchDuration: number;
  avgSearchScore: number;
  avgResultsCount: number;
  totalVectorsUpserted: number;
  totalVectorsDeleted: number;
}
