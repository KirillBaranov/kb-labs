/**
 * StorageStage - Store chunks with embeddings in vector database
 *
 * Responsibilities:
 * - Receive chunks with embeddings from EmbeddingStage
 * - Batch insert into vector database (efficient bulk operations)
 * - Handle storage errors gracefully
 * - Update existing chunks (deduplication by hash)
 * - Memory-efficient processing
 * - Progress reporting
 */

import type { PipelineStage, PipelineContext, StageResult } from '../pipeline-types';
import type { ChunkWithEmbedding } from './embedding';

export interface VectorStore {
  /**
   * Insert multiple chunks in one operation
   * @param chunks Chunks with embeddings to insert
   * @returns Number of chunks successfully inserted
   */
  insertBatch(chunks: ChunkWithEmbedding[]): Promise<number>;

  /**
   * Update existing chunks (by chunkId)
   * @param chunks Chunks to update
   * @returns Number of chunks successfully updated
   */
  updateBatch(chunks: ChunkWithEmbedding[]): Promise<number>;

  /**
   * Check which chunks already exist (by chunkId)
   * @param chunkIds Array of chunk IDs to check
   * @returns Set of chunk IDs that exist
   */
  checkExistence(chunkIds: string[]): Promise<Set<string>>;

  /**
   * Get chunks by hash (for deduplication)
   * @param hashes Array of file hashes
   * @returns Map of hash -> chunk IDs
   */
  getChunksByHash(hashes: string[]): Promise<Map<string, string[]>>;

  /**
   * Delete chunks by IDs
   * @param chunkIds Array of chunk IDs to delete
   * @returns Number of chunks deleted
   */
  deleteBatch(chunkIds: string[]): Promise<number>;

  /**
   * Get existing chunk IDs grouped by file path.
   * Used to remove stale chunks for files being re-indexed.
   */
  getChunkIdsByPaths(paths: string[]): Promise<Map<string, string[]>>;
}

/**
 * Storage Stage
 * Stores chunks with embeddings in vector database
 */
export class StorageStage implements PipelineStage {
  readonly name = 'storage';
  readonly description = 'Store chunks in vector database';

  private storedCount = 0;
  private updatedCount = 0;
  private skippedCount = 0;
  private invalidCount = 0;
  private staleDeletedCount = 0;
  private staleDeletedFilesCount = 0;

  constructor(
    private vectorStore: VectorStore,
    private chunks: ChunkWithEmbedding[],
    private options: {
      batchSize?: number; // Chunks per batch insert (default: 100)
      deduplication?: boolean; // Skip chunks with same hash (default: true)
      updateExisting?: boolean; // Update existing chunks (default: true)
    } = {}
  ) {}

  async execute(context: PipelineContext): Promise<StageResult> {
    if (this.chunks.length === 0) {
      context.logger.warn('No chunks to store');
      return {
        success: true,
        message: 'No chunks to process',
      };
    }

    context.logger.debug('Storing chunks', {
      chunksCount: this.chunks.length,
      deduplication: this.options.deduplication ?? true,
      updateExisting: this.options.updateExisting ?? true,
    });

    this.storedCount = 0;
    this.updatedCount = 0;
    this.skippedCount = 0;
    this.invalidCount = 0;
    this.staleDeletedCount = 0;
    this.staleDeletedFilesCount = 0;

    // Validate chunks before any storage operation.
    // Invalid chunks are dropped to protect index consistency.
    let chunksToStore = this.validateChunks(this.chunks, context);
    if (chunksToStore.length === 0) {
      context.logger.warn('No valid chunks to store after validation');
      return {
        success: true,
        message: 'No valid chunks to process',
        data: {
          chunksStored: 0,
          chunksUpdated: 0,
          chunksSkipped: 0,
          chunksInvalid: this.invalidCount,
          staleChunksDeleted: 0,
          totalChunks: 0,
        },
      };
    }

    // Remove stale chunks for changed files before insert/update.
    // This avoids leftover chunks when file structure changed.
    const staleCleanup = await this.deleteStaleChunksByPath(chunksToStore, context);
    this.staleDeletedCount = staleCleanup.deletedChunks;
    this.staleDeletedFilesCount = staleCleanup.deletedFiles;

    // Deduplication step (if enabled)
    if (this.options.deduplication !== false) {
      chunksToStore = await this.deduplicateChunks(chunksToStore, context);
    }

    // Calculate batch size
    const batchSize = this.options.batchSize ?? 100;

    // Process chunks in batches (sequentially for now - parallelism handled by platform)
    for (let i = 0; i < chunksToStore.length; i += batchSize) {
      const batch = chunksToStore.slice(i, i + batchSize);

      context.logger.debug('Processing storage batch', {
        batchStart: i,
        batchSize: batch.length,
        progress: `${i}/${chunksToStore.length}`,
      });

      try {
        // Check which chunks already exist
        const existingIds = await this.vectorStore.checkExistence(
          batch.map(c => c.chunkId)
        );

        // Split into new and existing chunks
        const newChunks: ChunkWithEmbedding[] = [];
        const existingChunks: ChunkWithEmbedding[] = [];

        for (const chunk of batch) {
          if (existingIds.has(chunk.chunkId)) {
            existingChunks.push(chunk);
          } else {
            newChunks.push(chunk);
          }
        }

        // Insert new chunks
        if (newChunks.length > 0) {
          const inserted = await this.vectorStore.insertBatch(newChunks);
          this.storedCount += inserted;

          context.logger.debug('Inserted new chunks', {
            count: inserted,
            batchStart: i,
          });
        }

        // Update existing chunks (if enabled)
        if (existingChunks.length > 0) {
          if (this.options.updateExisting !== false) {
            const updated = await this.vectorStore.updateBatch(existingChunks);
            this.updatedCount += updated;

            context.logger.debug('Updated existing chunks', {
              count: updated,
              batchStart: i,
            });
          } else {
            this.skippedCount += existingChunks.length;

            context.logger.debug('Skipped existing chunks', {
              count: existingChunks.length,
              batchStart: i,
            });
          }
        }

        // Report progress
        const totalProcessed = this.storedCount + this.updatedCount + this.skippedCount;
        if (context.onProgress && totalProcessed % 100 === 0) {
          context.onProgress({
            stage: this.name,
            current: totalProcessed,
            total: chunksToStore.length,
            message: `Stored ${totalProcessed}/${chunksToStore.length} chunks`,
          });
        }

        // Force GC periodically
        if (totalProcessed % 500 === 0 && global.gc) {
          global.gc();
        }

        // Apply memory backpressure
        await context.memoryMonitor.applyBackpressure();
      } catch (error) {
        // Log error for this batch
        context.logger.error('Failed to store batch', {
          batchStart: i,
          batchSize: batch.length,
          error: error instanceof Error ? error.message : String(error),
        });

        // Add to error stats
        for (const chunk of batch) {
          context.stats.errors.push({
            file: chunk.path,
            error: `Storage failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }

        // Check if too many errors
        if (context.stats.errors.length >= 100) {
          context.logger.error('Too many storage errors, aborting');
          break;
        }
      }
    }

    // Update context stats
    context.chunksStored = this.storedCount + this.updatedCount;
    context.stats.totalChunks = context.chunksStored;

    context.logger.debug('Storage complete', {
      chunksStored: this.storedCount,
      chunksUpdated: this.updatedCount,
      chunksSkipped: this.skippedCount,
      chunksInvalid: this.invalidCount,
      staleChunksDeleted: this.staleDeletedCount,
      staleFilesDeleted: this.staleDeletedFilesCount,
      totalChunks: context.chunksStored,
    });

    return {
      success: true,
      message: `Stored ${this.storedCount} new, updated ${this.updatedCount}, skipped ${this.skippedCount} chunks (${this.invalidCount} invalid, ${this.staleDeletedCount} stale deleted in ${this.staleDeletedFilesCount} files)`,
      data: {
        chunksStored: this.storedCount,
        chunksUpdated: this.updatedCount,
        chunksSkipped: this.skippedCount,
        chunksInvalid: this.invalidCount,
        staleChunksDeleted: this.staleDeletedCount,
        staleFilesDeleted: this.staleDeletedFilesCount,
        totalChunks: context.chunksStored,
      },
    };
  }

  private validateChunks(
    chunks: ChunkWithEmbedding[],
    context: PipelineContext
  ): ChunkWithEmbedding[] {
    const valid: ChunkWithEmbedding[] = [];

    for (const chunk of chunks) {
      const hasValidEmbedding =
        Array.isArray(chunk.embedding)
        && chunk.embedding.length > 0
        && chunk.embedding.every(value => Number.isFinite(value));
      const hasValidText = typeof chunk.text === 'string' && chunk.text.trim().length > 0;
      const hasIdentity =
        typeof chunk.chunkId === 'string'
        && chunk.chunkId.length > 0
        && typeof chunk.path === 'string'
        && chunk.path.length > 0;

      if (!hasValidEmbedding || !hasValidText || !hasIdentity) {
        this.invalidCount++;
        context.stats.errors.push({
          file: chunk.path || '<unknown>',
          error: 'Storage validation failed: invalid chunk payload',
        });
        continue;
      }

      valid.push(chunk);
    }

    if (this.invalidCount > 0) {
      context.logger.warn('Dropped invalid chunks before storage', {
        invalidChunks: this.invalidCount,
        totalChunks: chunks.length,
        validChunks: valid.length,
      });
    }

    return valid;
  }

  private async deleteStaleChunksByPath(
    chunks: ChunkWithEmbedding[],
    context: PipelineContext
  ): Promise<{ deletedChunks: number; deletedFiles: number }> {
    const paths = Array.from(
      new Set(
        chunks
          .map(chunk => chunk.path)
          .filter((path): path is string => typeof path === 'string' && path.length > 0)
      )
    );

    if (paths.length === 0) {
      return { deletedChunks: 0, deletedFiles: 0 };
    }

    const incomingChunkIds = new Set(chunks.map(chunk => chunk.chunkId));
    const existingByPath = await this.vectorStore.getChunkIdsByPaths(paths);
    const staleChunkIds: string[] = [];

    for (const existingIds of existingByPath.values()) {
      for (const existingId of existingIds) {
        if (!incomingChunkIds.has(existingId)) {
          staleChunkIds.push(existingId);
        }
      }
    }

    if (staleChunkIds.length === 0) {
      return { deletedChunks: 0, deletedFiles: 0 };
    }

    const deleted = await this.vectorStore.deleteBatch(staleChunkIds);
    const staleFilesDeleted = Array.from(existingByPath.entries())
      .filter(([, existingIds]) => existingIds.some(existingId => !incomingChunkIds.has(existingId)))
      .length;

    if (deleted > 0) {
      context.logger.debug('Deleted stale chunks for changed files', {
        staleCandidates: staleChunkIds.length,
        staleDeleted: deleted,
        staleFilesDeleted,
        filesTouched: paths.length,
      });
    }
    return { deletedChunks: deleted, deletedFiles: staleFilesDeleted };
  }

  /**
   * Deduplicate chunks by file hash
   * Skip chunks from files that haven't changed
   */
  private async deduplicateChunks(
    chunks: ChunkWithEmbedding[],
    context: PipelineContext
  ): Promise<ChunkWithEmbedding[]> {
    context.logger.debug('Checking for duplicate files', {
      chunksCount: chunks.length,
    });

    // Group chunks by file hash
    const chunksByHash = new Map<string, ChunkWithEmbedding[]>();
    for (const chunk of chunks) {
      if (chunk.hash) {
        const existing = chunksByHash.get(chunk.hash) ?? [];
        existing.push(chunk);
        chunksByHash.set(chunk.hash, existing);
      }
    }

    // Check which hashes already exist in DB
    const hashes = Array.from(chunksByHash.keys());
    const existingHashChunks = await this.vectorStore.getChunksByHash(hashes);

    // Filter out chunks from unchanged files
    const deduplicated: ChunkWithEmbedding[] = [];
    let skippedByHash = 0;

    for (const chunk of chunks) {
      if (!chunk.hash) {
        // No hash, include it
        deduplicated.push(chunk);
        continue;
      }

      const existingChunkIds = existingHashChunks.get(chunk.hash);
      if (!existingChunkIds || existingChunkIds.length === 0) {
        // Hash not found, this is a new file
        deduplicated.push(chunk);
      } else {
        // Hash exists, check if mtime changed
        // If mtime is newer, include (file was modified but hash collision)
        // For now, skip it (assume hash is reliable)
        skippedByHash++;
      }
    }

    if (skippedByHash > 0) {
      context.logger.debug('Skipped chunks from unchanged files', {
        skipped: skippedByHash,
        uniqueFiles: existingHashChunks.size,
      });
    }

    return deduplicated;
  }

  /**
   * Optional: Cleanup
   */
  async cleanup(context: PipelineContext): Promise<void> {
    context.logger.debug('Storage stage cleanup', {
      chunksStored: this.storedCount,
      chunksUpdated: this.updatedCount,
      chunksSkipped: this.skippedCount,
    });
  }

  /**
   * Optional: Checkpoint
   */
  async checkpoint(context: PipelineContext): Promise<any> {
    return {
      stage: this.name,
      processedFiles: [],
      stats: context.stats,
      timestamp: Date.now(),
      chunksStored: this.storedCount,
      chunksUpdated: this.updatedCount,
    };
  }
}
