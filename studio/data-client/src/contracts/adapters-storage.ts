/**
 * @module @kb-labs/studio-data-client/contracts/adapters-storage
 * Storage adapter analytics contracts
 */

/**
 * Storage usage statistics
 */
export interface StorageUsageStats {
  readOperations: number;
  writeOperations: number;
  deleteOperations: number;
  totalBytesRead: number;
  totalBytesWritten: number;
  avgReadDuration: number;
  avgWriteDuration: number;
}
