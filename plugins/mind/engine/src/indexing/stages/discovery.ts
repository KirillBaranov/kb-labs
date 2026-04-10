/**
 * FileDiscoveryStage - Discovers files to index
 *
 * Responsibilities:
 * - Scan source paths with glob patterns
 * - Apply include/exclude filters
 * - Collect file metadata (size, mtime, etc.)
 * - Output list of files to process
 */

import fg from 'fast-glob';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PipelineStage, PipelineContext, StageResult } from '../pipeline-types';

export interface FileMetadata {
  relativePath: string;
  fullPath: string;
  size: number;
  mtime: number;
  extension: string;
  sourceId: string;
  sourceKind?: string;
  sourceLanguage?: string;
}

/**
 * File Discovery Stage
 * Finds all files that need to be indexed
 */
export class FileDiscoveryStage implements PipelineStage {
  readonly name = 'discovery';
  readonly description = 'Discover files to index';

  private discoveredFiles: FileMetadata[] = [];

  async execute(context: PipelineContext): Promise<StageResult> {
    context.logger.debug('Discovering files', {
      sources: context.sources.length,
    });

    this.discoveredFiles = [];

    // Process each source
    for (const source of context.sources) {
      const sourceFiles = await this.discoverSourceFiles(source, context);
      this.discoveredFiles.push(...sourceFiles);
    }

    // Store file paths in context for next stages
    context.filePaths = this.discoveredFiles.map(f => f.relativePath);
    context.stats.filesDiscovered = this.discoveredFiles.length;

    context.logger.debug('File discovery complete', {
      filesFound: this.discoveredFiles.length,
      totalSize: `${(this.discoveredFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB`,
    });

    return {
      success: true,
      message: `Discovered ${this.discoveredFiles.length} files`,
      data: {
        filesFound: this.discoveredFiles.length,
      },
    };
  }

  /**
   * Discover files for a single source
   */
  private async discoverSourceFiles(
    source: any,
    context: PipelineContext
  ): Promise<FileMetadata[]> {
    const files: FileMetadata[] = [];

    // Normalize paths (handles both strings and objects)
    const paths = Array.isArray(source.paths) ? source.paths : [source.paths];

    if (!context.workspaceRoot) {
      throw new Error('workspaceRoot is required for FileDiscoveryStage');
    }
    const cwd = context.workspaceRoot;

    for (const pattern of paths) {
      const matches = await fg(pattern, {
        cwd,
        dot: false,
        onlyFiles: true,
        ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
      });

      for (const relativePath of matches) {
        try {
          const fullPath = path.resolve(cwd, relativePath);
          const stats = await fs.stat(fullPath);

          // Only include files (skip directories, symlinks, etc.)
          if (!stats.isFile()) {
            continue;
          }

          const extension = path.extname(relativePath).toLowerCase();

          files.push({
            relativePath,
            fullPath,
            size: stats.size,
            mtime: stats.mtimeMs,
            extension,
            sourceId: source.id,
            sourceKind: source.kind,
            sourceLanguage: source.language,
          });
        } catch (error) {
          // File might have been deleted between glob and stat
          context.logger.warn('Failed to stat file', {
            file: relativePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return files;
  }

  /**
   * Get discovered files (for use by next stages)
   */
  getDiscoveredFiles(): ReadonlyArray<FileMetadata> {
    return this.discoveredFiles;
  }

  /**
   * Optional: Cleanup
   */
  async cleanup(context: PipelineContext): Promise<void> {
    // Clear file list to free memory
    // Note: filePaths in context are just strings, not full metadata
    this.discoveredFiles = [];
  }

  /**
   * Optional: Checkpoint
   */
  async checkpoint(context: PipelineContext): Promise<any> {
    return {
      stage: this.name,
      processedFiles: [], // Discovery doesn't process, just discovers
      stats: context.stats,
      timestamp: Date.now(),
      discoveredFiles: context.filePaths,
    };
  }

  /**
   * Optional: Restore from checkpoint
   */
  async restore(data: any, context: PipelineContext): Promise<void> {
    if (data.discoveredFiles) {
      context.filePaths = data.discoveredFiles;
      context.stats.filesDiscovered = data.discoveredFiles.length;
      context.logger.debug('Restored discovered files from checkpoint', {
        count: data.discoveredFiles.length,
      });
    }
  }
}
