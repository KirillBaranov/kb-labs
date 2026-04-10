/**
 * @module @kb-labs/mind-engine/index/incremental-builder
 * Incremental index builder for creating overlay from changed files
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from '../types/embedding-provider';
import type { VectorStore, StoredMindChunk } from '../vector-store/vector-store';
import type { ChangedFile } from './git-diff';
import { getChunkerForFile, type Chunk } from '../chunking/index';

/**
 * Options for building overlay
 */
export interface OverlayBuildOptions {
  /** Scope ID */
  scopeId: string;

  /** Workspace root directory */
  workspaceRoot: string;

  /** Embedding provider */
  embeddingProvider: EmbeddingProvider;

  /** Maximum files to process (safety limit) */
  maxFiles?: number;

  /** Chunking options */
  chunking?: {
    codeLines?: number;
    docLines?: number;
    overlap?: number;
  };

  /** Progress callback */
  onProgress?: (event: OverlayBuildProgress) => void;
}

/**
 * Progress event during overlay build
 */
export interface OverlayBuildProgress {
  stage: 'reading' | 'chunking' | 'embedding' | 'storing';
  current: number;
  total: number;
  file?: string;
}

/**
 * Result of building overlay
 */
export interface OverlayBuildResult {
  /** Chunks created from changed files */
  chunks: StoredMindChunk[];

  /** Paths that were deleted */
  deletedPaths: string[];

  /** Paths that were modified */
  modifiedPaths: string[];

  /** Build statistics */
  stats: {
    filesProcessed: number;
    filesSkipped: number;
    chunksCreated: number;
    embeddingsGenerated: number;
    timeMs: number;
  };
}

/**
 * Default chunking options
 */
const DEFAULT_CHUNKING = {
  codeLines: 120,
  docLines: 80,
  overlap: 20,
};

/**
 * Incremental index builder
 */
export class IncrementalIndexBuilder {
  /**
   * Build overlay from changed files
   */
  async buildOverlay(
    changedFiles: ChangedFile[],
    options: OverlayBuildOptions,
  ): Promise<OverlayBuildResult> {
    const startTime = Date.now();
    const chunking = { ...DEFAULT_CHUNKING, ...options.chunking };
    const maxFiles = options.maxFiles ?? 100;

    const deletedPaths: string[] = [];
    const modifiedPaths: string[] = [];
    const filesToProcess: ChangedFile[] = [];

    // Categorize changes
    for (const file of changedFiles) {
      if (file.status === 'deleted') {
        deletedPaths.push(file.path);
      } else {
        modifiedPaths.push(file.path);
        filesToProcess.push(file);
      }
    }

    // Safety limit
    if (filesToProcess.length > maxFiles) {
      throw new Error(
        `Too many changed files (${filesToProcess.length} > ${maxFiles}). ` +
        `Consider running full reindex or increasing maxFiles.`
      );
    }

    // Read and chunk files
    const allChunks: Array<{
      chunk: Chunk;
      path: string;
      sourceId: string;
    }> = [];

    let filesProcessed = 0;
    let filesSkipped = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i]!;
      const fullPath = path.join(options.workspaceRoot, file.path);

      options.onProgress?.({
        stage: 'reading',
        current: i + 1,
        total: filesToProcess.length,
        file: file.path,
      });

      try {
        // Check if file exists and is readable
        const stat = await fs.stat(fullPath);

        // Skip large files
        if (stat.size > 10 * 1024 * 1024) {
          filesSkipped++;
          continue;
        }

        const content = await fs.readFile(fullPath, 'utf8');

        // Get chunker for this file type
        const chunker = getChunkerForFile(file.path);
        const maxLines = this.isDocFile(file.path) ? chunking.docLines : chunking.codeLines;

        const chunks = chunker.chunk(content, file.path, {
          maxLines,
          minLines: Math.floor(maxLines / 4),
          overlap: chunking.overlap,
          preserveContext: true,
        });

        for (const chunk of chunks) {
          allChunks.push({
            chunk,
            path: file.path,
            sourceId: this.getSourceId(file.path),
          });
        }

        filesProcessed++;
      } catch (error) {
        // File might not exist (deleted but not committed)
        filesSkipped++;
      }
    }

    if (allChunks.length === 0) {
      return {
        chunks: [],
        deletedPaths,
        modifiedPaths,
        stats: {
          filesProcessed,
          filesSkipped,
          chunksCreated: 0,
          embeddingsGenerated: 0,
          timeMs: Date.now() - startTime,
        },
      };
    }

    // Generate embeddings
    options.onProgress?.({
      stage: 'embedding',
      current: 0,
      total: allChunks.length,
    });

    const texts = allChunks.map(c => c.chunk.text);
    const embeddings = await options.embeddingProvider.embed(texts);

    // Build stored chunks
    const storedChunks: StoredMindChunk[] = allChunks.map((item, idx) => {
      const { chunk, path: filePath, sourceId } = item;
      const embedding = embeddings[idx]!;

      const chunkId = this.generateChunkId(
        sourceId,
        filePath,
        chunk.span.startLine,
        chunk.span.endLine,
      );

      return {
        chunkId,
        scopeId: options.scopeId,
        sourceId,
        path: filePath,
        span: chunk.span,
        text: chunk.text,
        metadata: {
          chunkType: chunk.type,
          chunkName: chunk.name,
          overlay: true,
          overlayTimestamp: Date.now(),
          ...chunk.metadata,
        },
        embedding,
      };
    });

    return {
      chunks: storedChunks,
      deletedPaths,
      modifiedPaths,
      stats: {
        filesProcessed,
        filesSkipped,
        chunksCreated: storedChunks.length,
        embeddingsGenerated: embeddings.length,
        timeMs: Date.now() - startTime,
      },
    };
  }

  /**
   * Check if file is a documentation file
   */
  private isDocFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.md', '.mdx', '.txt', '.rst', '.adoc'].includes(ext);
  }

  /**
   * Get source ID from file path
   */
  private getSourceId(filePath: string): string {
    // Use directory as source ID
    const dir = path.dirname(filePath);
    return dir === '.' ? 'root' : dir.split(path.sep)[0] ?? 'root';
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(
    sourceId: string,
    filePath: string,
    startLine: number,
    endLine: number,
  ): string {
    const hash = createHash('sha256')
      .update(`${sourceId}:${filePath}:${startLine}-${endLine}`)
      .digest('hex')
      .substring(0, 12);

    return `overlay:${hash}`;
  }
}

/**
 * Create overlay from changed files and store in vector store
 */
export async function buildAndStoreOverlay(
  changedFiles: ChangedFile[],
  vectorStore: VectorStore,
  options: OverlayBuildOptions,
): Promise<OverlayBuildResult> {
  const builder = new IncrementalIndexBuilder();
  const result = await builder.buildOverlay(changedFiles, options);

  // Store chunks in overlay vector store
  // DEBUG: Early exit with fake chunk to test vectorStore calls
  const fs = await import('node:fs/promises');
  await fs.appendFile('/tmp/platform-vector-debug.log', `[incremental-builder] Testing vectorStore with fake chunk\n`);

  const fakeChunk = {
    chunkId: 'test-chunk-123',
    scopeId: options.scopeId,
    sourceId: 'test-source',
    path: '/test/path.ts',
    span: { start: { line: 1, column: 0 }, end: { line: 10, column: 0 }, startLine: 1, endLine: 10 },
    contentHash: 'fake-hash',
    text: 'test content',
    embedding: { values: new Array(1536).fill(0.1), dim: 1536 },
    metadata: {},
  };

  if (vectorStore.upsertChunks) {
    await fs.appendFile('/tmp/platform-vector-debug.log', `[incremental-builder] Calling vectorStore.upsertChunks with 1 fake chunk\n`);
    await vectorStore.upsertChunks(options.scopeId, [fakeChunk]);
  } else {
    await fs.appendFile('/tmp/platform-vector-debug.log', `[incremental-builder] Calling vectorStore.replaceScope with 1 fake chunk\n`);
    await vectorStore.replaceScope(options.scopeId, [fakeChunk]);
  }

  await fs.appendFile('/tmp/platform-vector-debug.log', `[incremental-builder] vectorStore call completed, exiting early (DEBUG MODE)\n`);

  // Return early for debug
  return { ...result, chunks: [fakeChunk] };

  /* COMMENTED OUT FOR DEBUG
  if (result.chunks.length > 0) {
    options.onProgress?.({
      stage: 'storing',
      current: 0,
      total: result.chunks.length,
    });

    if (vectorStore.upsertChunks) {
      await vectorStore.upsertChunks(options.scopeId, result.chunks);
    } else {
      await vectorStore.replaceScope(options.scopeId, result.chunks);
    }
  }

  return result;
  */
}

/**
 * Create an incremental index builder
 */
export function createIncrementalBuilder(): IncrementalIndexBuilder {
  return new IncrementalIndexBuilder();
}
