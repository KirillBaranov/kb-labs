/**
 * @module @kb-labs/mind-engine/sync/batch-sync
 * Batch synchronization operations
 */

import type { DocumentSyncAPI } from './document-sync';
import type {
  SyncOperation,
  BatchSyncResult,
  SyncResult,
} from './types';

export interface BatchSyncOptions {
  maxSize?: number;
  maxSizeOverride?: number;
  concurrency?: number;
}

/**
 * Execute batch sync operations
 */
export async function syncBatch(
  api: DocumentSyncAPI,
  operations: SyncOperation[],
  options: BatchSyncOptions = {},
): Promise<BatchSyncResult> {
  const maxSize = options.maxSizeOverride ?? options.maxSize ?? 100;

  // Validate batch size
  if (operations.length > maxSize) {
    throw new Error(
      `Batch size ${operations.length} exceeds maximum allowed size of ${maxSize}. ` +
        `Use --max-size flag or increase maxBatchSize in config.`,
    );
  }

  const results: SyncResult[] = [];
  const concurrency = options.concurrency ?? 5;

  // Process operations with concurrency limit
  for (let i = 0; i < operations.length; i += concurrency) {
    const batch = operations.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (op) => {
        try {
          switch (op.operation) {
            case 'add':
              if (!op.content) {
                return {
                  success: false,
                  documentId: `${op.source}:${op.id}`,
                  scopeId: op.scopeId,
                  chunksAdded: 0,
                  error: 'Content is required for add operation',
                };
              }
              return await api.addDocument({
                source: op.source,
                id: op.id,
                scopeId: op.scopeId,
                content: op.content,
                metadata: op.metadata,
              });

            case 'update':
              if (!op.content) {
                return {
                  success: false,
                  documentId: `${op.source}:${op.id}`,
                  scopeId: op.scopeId,
                  chunksAdded: 0,
                  error: 'Content is required for update operation',
                };
              }
              return await api.updateDocument({
                source: op.source,
                id: op.id,
                scopeId: op.scopeId,
                content: op.content,
                metadata: op.metadata,
              });

            case 'delete':
              return await api.deleteDocument({
                source: op.source,
                id: op.id,
                scopeId: op.scopeId,
              });

            default:
              return {
                success: false,
                documentId: `${op.source}:${op.id}`,
                scopeId: op.scopeId,
                chunksAdded: 0,
                error: `Unknown operation: ${(op as any).operation}`,
              };
          }
        } catch (error) {
          return {
            success: false,
            documentId: `${op.source}:${op.id}`,
            scopeId: op.scopeId,
            chunksAdded: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    results.push(...batchResults);
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return {
    total: operations.length,
    successful,
    failed,
    results,
  };
}



