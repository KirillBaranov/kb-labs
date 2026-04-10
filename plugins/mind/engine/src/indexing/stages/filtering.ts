/**
 * FileFilteringStage - Filters files by hash/mtime to skip unchanged files
 *
 * Responsibilities:
 * - Check file metadata (mtime, size) for quick filtering
 * - Calculate hash for potentially changed files
 * - Query vector store for existing chunks
 * - Output only new/changed files to next stages
 *
 * Optimization Strategy:
 * 1. Quick filter: mtime + size (no file read)
 * 2. Hash check: for suspicious files (file read + hash)
 * 3. Vector store query: batch check for existing chunks
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import type { PipelineStage, PipelineContext, StageResult } from '../pipeline-types';
import type { FileMetadata } from './discovery';

export interface FileMetadataWithHash extends FileMetadata {
  hash?: string;
}

export interface VectorStoreMetadata {
  /**
   * Get file metadata from vector store
   * @param scopeId Scope ID
   * @param paths File paths to check
   * @returns Map of path -> metadata (mtime, size, hash)
   */
  getFilesMetadata(
    scopeId: string,
    paths: string[]
  ): Promise<Map<string, { mtime: number; size: number; hash: string }>>;
}

/**
 * File Filtering Stage
 * Filters out unchanged files based on mtime/size/hash
 */
export class FileFilteringStage implements PipelineStage {
  readonly name = 'filtering';
  readonly description = 'Filter unchanged files';

  private filteredFiles: FileMetadataWithHash[] = [];
  private skippedByMtime = 0;
  private skippedByHash = 0;

  constructor(
    private discoveredFiles: ReadonlyArray<FileMetadata>,
    private vectorStore: VectorStoreMetadata | null,
    private scopeId: string,
    private options: {
      /** Enable quick mtime+size filtering (default: true) */
      quickFilter?: boolean;
      /** Enable hash-based filtering (default: true) */
      hashFilter?: boolean;
      /** Batch size for metadata queries (default: 100) */
      batchSize?: number;
    } = {}
  ) {}

  async execute(context: PipelineContext): Promise<StageResult> {
    context.logger.debug('Filtering files', {
      totalFiles: this.discoveredFiles.length,
      quickFilter: this.options.quickFilter ?? true,
      hashFilter: this.options.hashFilter ?? true,
    });

    this.filteredFiles = [];
    this.skippedByMtime = 0;
    this.skippedByHash = 0;

    // If no vector store or filtering disabled, pass all files through
    if (!this.vectorStore || (!this.options.quickFilter && !this.options.hashFilter)) {
      context.logger.debug('Filtering disabled or no vector store, passing all files');
      this.filteredFiles = this.discoveredFiles.map(f => ({ ...f }));
      return {
        success: true,
        message: `All ${this.filteredFiles.length} files will be processed`,
        data: {
          totalFiles: this.discoveredFiles.length,
          filteredFiles: this.filteredFiles.length,
          skippedByMtime: 0,
          skippedByHash: 0,
        },
      };
    }

    const batchSize = this.options.batchSize ?? 100;
    const filesToProcess = Array.from(this.discoveredFiles);

    // Process in batches to avoid overloading vector store
    for (let i = 0; i < filesToProcess.length; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);
      await this.processBatch(batch, context);

      // Report progress
      const totalProcessed = i + batch.length;
      if (context.onProgress && totalProcessed % 100 === 0) {
        context.onProgress({
          stage: this.name,
          current: totalProcessed,
          total: filesToProcess.length,
          message: `Filtered ${totalProcessed}/${filesToProcess.length} files`,
        });
      }
    }

    // Update context stats
    context.stats.filesSkipped = this.skippedByMtime + this.skippedByHash;

    context.logger.debug('File filtering complete', {
      totalFiles: this.discoveredFiles.length,
      filteredFiles: this.filteredFiles.length,
      skippedByMtime: this.skippedByMtime,
      skippedByHash: this.skippedByHash,
      totalSkipped: context.stats.filesSkipped,
    });

    return {
      success: true,
      message: `Filtered ${this.filteredFiles.length} files to process (skipped ${context.stats.filesSkipped})`,
      data: {
        totalFiles: this.discoveredFiles.length,
        filteredFiles: this.filteredFiles.length,
        skippedByMtime: this.skippedByMtime,
        skippedByHash: this.skippedByHash,
      },
    };
  }

  /**
   * Process a batch of files
   */
  private async processBatch(
    batch: FileMetadata[],
    context: PipelineContext
  ): Promise<void> {
    if (!this.vectorStore) {
      // Shouldn't happen (checked in execute), but safety
      this.filteredFiles.push(...batch);
      return;
    }

    // Step 1: Get existing metadata from vector store
    const paths = batch.map(f => f.relativePath);
    const existingMetadata = await this.vectorStore.getFilesMetadata(this.scopeId, paths);

    context.logger.debug('Retrieved metadata from vector store', {
      batchSize: batch.length,
      existingCount: existingMetadata.size,
    });

    // Step 2: Quick filter by mtime + size
    const needsHashCheck: FileMetadata[] = [];
    const definitelyNew: FileMetadata[] = [];

    for (const file of batch) {
      const existing = existingMetadata.get(file.relativePath);

      if (!existing) {
        // New file - definitely needs processing
        definitelyNew.push(file);
        continue;
      }

      // Quick check: mtime and size
      if (
        this.options.quickFilter !== false &&
        existing.mtime === file.mtime &&
        existing.size === file.size
      ) {
        // Definitely unchanged - skip
        this.skippedByMtime++;
        context.logger.debug('Skipped by mtime+size', { file: file.relativePath });
        continue;
      }

      // Suspicious - needs hash check
      needsHashCheck.push(file);
    }

    // Step 3: Hash check for suspicious files
    if (needsHashCheck.length > 0 && this.options.hashFilter !== false) {
      context.logger.debug('Checking hashes for suspicious files', {
        count: needsHashCheck.length,
      });

      for (const file of needsHashCheck) {
        const existing = existingMetadata.get(file.relativePath);
        if (!existing) {
          // Shouldn't happen, but safety
          definitelyNew.push(file);
          continue;
        }

        // Calculate hash
        const content = await fs.readFile(file.fullPath, 'utf-8');
        const hash = createHash('sha256').update(content).digest('hex');

        if (hash === existing.hash) {
          // Hash matches - file unchanged (mtime/size differ but content same)
          this.skippedByHash++;
          context.logger.debug('Skipped by hash', { file: file.relativePath });
        } else {
          // Hash differs - file changed
          this.filteredFiles.push({ ...file, hash });
        }
      }
    } else if (needsHashCheck.length > 0) {
      // Hash check disabled - include all suspicious files
      this.filteredFiles.push(...needsHashCheck);
    }

    // Add definitely new files
    this.filteredFiles.push(...definitelyNew);
  }

  /**
   * Get filtered files (for use by next stages)
   */
  getFilteredFiles(): ReadonlyArray<FileMetadataWithHash> {
    return this.filteredFiles;
  }

  /**
   * Optional: Cleanup
   */
  async cleanup(context: PipelineContext): Promise<void> {
    // Clear file list to free memory
    this.filteredFiles = [];
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
      filteredFiles: this.filteredFiles.map(f => f.relativePath),
      skippedByMtime: this.skippedByMtime,
      skippedByHash: this.skippedByHash,
    };
  }
}
