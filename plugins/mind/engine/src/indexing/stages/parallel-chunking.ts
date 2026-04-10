/**
 * ParallelChunkingStage - Memory-aware parallel file chunking
 *
 * Enhanced version with TRULY ADAPTIVE memory-based concurrency:
 * - NO MAGIC NUMBERS - purely memory-based decisions
 * - Checks heap before taking each task
 * - Dynamically scales from 1 to MAX based on available memory
 * - Prevents OOM by estimating file memory usage
 *
 * Performance:
 * - Adapts to available memory in real-time
 * - More memory = more parallel tasks
 * - Less memory = fewer tasks (prevents OOM)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { PipelineStage, PipelineContext, StageResult } from '../pipeline-types';
import type { AdaptiveChunkerFactory } from '../../chunking/adaptive-factory';
import type { FileMetadata } from './discovery';
import type { MindChunk } from './types';
import { createMemoryAwareQueue } from '../memory-aware-queue';

export interface ParallelChunkingOptions {
  /**
   * Safe memory threshold (0-1, default 0.7 = 70% of heap limit)
   */
  safeThreshold?: number;

  /**
   * Minimum concurrency (will always try to have at least this many tasks running)
   */
  minConcurrency?: number;

  /**
   * Memory reserve (in bytes) to always keep free
   * Default: 512MB
   */
  memoryReserve?: number;
}

interface ChunkFileTask {
  source: any;
  relativePath: string;
  fullPath: string;
  size: number;
  ext: string;
  metadata?: FileMetadata;
}

/**
 * Parallel Chunking Stage
 * Processes files in parallel using memory-aware queue
 */
export class ParallelChunkingStage implements PipelineStage {
  readonly name = 'parallel-chunking';
  readonly description = 'Convert files to chunks (memory-aware parallel)';

  private chunks: MindChunk[] = [];

  constructor(
    private chunkerFactory: AdaptiveChunkerFactory,
    private runtime: any, // RuntimeAdapter
    private fileMetadata?: Map<string, FileMetadata>,
    private options: ParallelChunkingOptions = {}
  ) {}

  async execute(context: PipelineContext): Promise<StageResult> {
    // Use files from fileMetadata (filtered files) instead of context.filePaths (all discovered files)
    const filePaths = this.fileMetadata ? Array.from(this.fileMetadata.keys()) : (context.filePaths ?? []);

    if (filePaths.length === 0) {
      context.logger.warn('No files to chunk');
      return {
        success: true,
        message: 'No files to process',
      };
    }

    context.logger.debug('Starting memory-aware parallel chunking', {
      filesCount: filePaths.length,
      safeThreshold: this.options.safeThreshold ?? 0.7,
      minConcurrency: this.options.minConcurrency ?? 1,
      memoryReserve: `${((this.options.memoryReserve ?? 512 * 1024 * 1024) / 1024 / 1024).toFixed(0)}MB`,
    });

    this.chunks = [];
    let processedCount = 0;

    // Prepare tasks
    if (!context.workspaceRoot) {
      throw new Error('workspaceRoot is required for ParallelChunkingStage');
    }

    const tasks: ChunkFileTask[] = [];
    const sourceById = new Map(context.sources.map(source => [source.id, source]));
    const workspaceRoot = context.workspaceRoot;
    for (const relativePath of filePaths) {
      const metadata = this.fileMetadata?.get(relativePath);
      const source = metadata?.sourceId
        ? sourceById.get(metadata.sourceId)
        : context.sources[0];

      if (!source) {
        context.stats.errors.push({
          file: relativePath,
          error: 'No matching source found for file',
        });
        continue;
      }

      tasks.push({
        source,
        relativePath,
        fullPath: path.resolve(workspaceRoot, relativePath),
        size: metadata?.size ?? 0,
        ext: path.extname(relativePath).toLowerCase(),
        metadata,
      });
    }

    // Create memory-aware queue
    const memoryQueue = createMemoryAwareQueue<ChunkFileTask>({
      estimateMemory: (task) => {
        // Use chunker factory to estimate memory for this file
        return this.chunkerFactory.estimateMemoryUsage({
          path: task.relativePath,
          size: task.size,
          extension: task.ext,
        });
      },
      worker: async (task) => {
        const fileChunks = await this.chunkFileWorker(task, context);
        this.chunks.push(...fileChunks);
        processedCount++;

        // Report progress
        if (context.onProgress && processedCount % 10 === 0) {
          const stats = memoryQueue.getStats();
          context.onProgress({
            stage: this.name,
            current: processedCount,
            total: tasks.length,
            message: `Chunked ${processedCount}/${tasks.length} files (${stats.activeTasks} active, heap: ${(stats.heapUsagePercent * 100).toFixed(0)}%)`,
          });
        }

        return fileChunks;
      },
      safeThreshold: this.options.safeThreshold ?? 0.7, // 70% of heap limit
      minConcurrency: this.options.minConcurrency ?? 1,
      memoryReserve: this.options.memoryReserve ?? 512 * 1024 * 1024, // 512MB
      checkInterval: 100, // Check every 100ms
    });

    // Start processing
    memoryQueue.start();

    // Enqueue all tasks
    try {
      const promises = tasks.map(task => memoryQueue.enqueue(task));
      await Promise.all(promises);

      // Shutdown queue
      await memoryQueue.shutdown();

      // Apply final backpressure
      await context.memoryMonitor.applyBackpressure();
    } catch (error) {
      context.logger.error('Memory-aware chunking failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Update context stats
    context.stats.filesProcessed = processedCount;
    context.stats.filesSkipped = 0;
    context.chunksProcessed = this.chunks.length;

    const queueStats = memoryQueue.getStats();
    context.logger.debug('Memory-aware parallel chunking complete', {
      filesProcessed: processedCount,
      totalChunks: this.chunks.length,
      peakActiveTasks: queueStats.activeTasks,
      failedTasks: queueStats.failedTasks,
      heapUsagePercent: (queueStats.heapUsagePercent * 100).toFixed(1) + '%',
    });

    return {
      success: true,
      message: `Chunked ${processedCount} files into ${this.chunks.length} chunks (memory-aware)`,
      data: {
        filesProcessed: processedCount,
        totalChunks: this.chunks.length,
        peakActiveTasks: queueStats.activeTasks,
      },
    };
  }

  /**
   * Worker function - processes a single file
   */
  private async chunkFileWorker(
    task: ChunkFileTask,
    context: PipelineContext
  ): Promise<MindChunk[]> {
    const { source, relativePath, fullPath, size, ext } = task;
    const normalizedPath = relativePath.replace(/\\/g, '/');

    try {
      // Get file info
      const stats = await fs.stat(fullPath);
      const mtime = stats.mtimeMs;

      // Select appropriate chunker
      const chunker = this.chunkerFactory.select({
        path: normalizedPath,
        size,
        extension: ext,
      });

      // Calculate file hash (for deduplication)
      const hashStream = createHash('sha256');
      const fileStream = await fs.open(fullPath, 'r');
      const readStream = fileStream.createReadStream();

      for await (const chunk of readStream) {
        hashStream.update(chunk);
      }

      const hash = hashStream.digest('hex');
      await fileStream.close();

      // Check if chunker supports streaming
      const chunkerWithStream = chunker as any;
      if (!chunkerWithStream.chunkStream) {
        throw new Error(
          `Chunker ${chunker.id} does not support streaming. ` +
          `All chunkers must implement chunkStream() for memory safety.`
        );
      }

      // Stream chunks from file
      const fileChunks: MindChunk[] = [];

      for await (const sourceChunk of chunkerWithStream.chunkStream(fullPath, {})) {
        const metadata = buildChunkMetadata({
          source,
          sourceChunkMetadata: sourceChunk.metadata ?? {},
          normalizedPath,
          hash,
          mtime,
          indexRevision: context.indexRevision,
          indexedAt: context.indexedAt,
        });

        // Create MindChunk
        const mindChunk: MindChunk = {
          chunkId: `${source.id}:${normalizedPath}:${sourceChunk.span.startLine}-${sourceChunk.span.endLine}`,
          sourceId: source.id,
          path: normalizedPath,
          span: sourceChunk.span,
          text: sourceChunk.text,
          metadata,
          hash,
          mtime,
        };

        fileChunks.push(mindChunk);
      }

      return fileChunks;
    } catch (error) {
      context.logger.error('Failed to chunk file', {
        file: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });

      context.stats.errors.push({
        file: relativePath,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty array on error (don't fail entire batch)
      return [];
    }
  }

  /**
   * Get chunks (for next stage)
   */
  getChunks(): ReadonlyArray<MindChunk> {
    return this.chunks;
  }

  /**
   * Optional: Cleanup
   */
  async cleanup(context: PipelineContext): Promise<void> {
    context.logger.debug('Memory-aware parallel chunking cleanup', {
      chunksInMemory: this.chunks.length,
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
      chunksGenerated: this.chunks.length,
    };
  }
}

function buildChunkMetadata(input: {
  source: any;
  sourceChunkMetadata: Record<string, unknown>;
  normalizedPath: string;
  hash: string;
  mtime: number;
  indexRevision?: string;
  indexedAt?: number;
}): Record<string, unknown> {
  const sourceKind = normalizeSourceKind(input.source?.kind, input.normalizedPath);
  const sourceTrust = resolveSourceTrust(sourceKind, input.sourceChunkMetadata.sourceTrust);
  const metadata: Record<string, unknown> = {
    ...input.sourceChunkMetadata,
    kind: input.source?.kind,
    language: input.source?.language,
    sourceId: input.source?.id,
    sourceKind,
    sourceLanguage: input.source?.language,
    path: input.normalizedPath,
    indexRevision: input.indexRevision ?? 'unknown',
    indexedAt: input.indexedAt ?? Date.now(),
    fileHash: input.hash,
    fileMtime: input.mtime,
    gitCommitTs: resolveTimestampOrFallback(input.sourceChunkMetadata.gitCommitTs, input.mtime),
    sourceTrust,
  };

  if (sourceKind === 'docs' || sourceKind === 'adr') {
    const docId = coerceString(input.sourceChunkMetadata.docId)
      ?? input.normalizedPath.replace(/\.[^/.]+$/, '').toLowerCase();
    const docTitle = coerceString(input.sourceChunkMetadata.docTitle)
      ?? deriveDocTitle(input.normalizedPath);
    const docSectionPath = coerceString(input.sourceChunkMetadata.docSectionPath)
      ?? '';
    const topicKey = coerceString(input.sourceChunkMetadata.topicKey)
      ?? normalizeTopicKey(input.normalizedPath);
    const freshnessScore = resolveNumeric(
      input.sourceChunkMetadata.freshnessScore,
      calculateFreshnessFromMtime(input.mtime),
    );

    metadata.docId = docId;
    metadata.docTitle = docTitle;
    metadata.docSectionPath = docSectionPath;
    metadata.topicKey = topicKey;
    metadata.freshnessScore = freshnessScore;
  }

  return metadata;
}

function normalizeSourceKind(kind: unknown, filePath: string): string {
  if (typeof kind === 'string' && kind.trim().length > 0) {
    return kind.trim().toLowerCase();
  }
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.md') || normalized.includes('/docs/')) {return 'docs';}
  if (normalized.includes('/adr/') || normalized.includes('/decisions/')) {return 'adr';}
  if (normalized.includes('/test/') || normalized.includes('/__tests__/') || normalized.includes('.spec.')) {return 'test';}
  if (normalized.includes('/config/') || normalized.endsWith('.json') || normalized.endsWith('.yaml') || normalized.endsWith('.yml')) {return 'config';}
  return 'code';
}

function resolveSourceTrust(sourceKind: string, value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  switch (sourceKind) {
    case 'adr':
      return 0.9;
    case 'docs':
      return 0.8;
    case 'config':
      return 0.75;
    case 'code':
      return 0.7;
    case 'test':
      return 0.65;
    default:
      return 0.6;
  }
}

function resolveTimestampOrFallback(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function deriveDocTitle(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath;
  const stem = filename.replace(/\.[^/.]+$/, '');
  return stem.replace(/[-_]+/g, ' ').trim();
}

function normalizeTopicKey(filePath: string): string {
  return filePath
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]?v?\d+(\.\d+)*/g, '')
    .replace(/[0-9]{4}-[0-9]{2}-[0-9]{2}/g, '')
    .replace(/\/+/g, '/')
    .trim();
}

function calculateFreshnessFromMtime(mtime: number): number {
  const ageDays = Math.max(0, (Date.now() - mtime) / (24 * 60 * 60 * 1000));
  const score = 1 - Math.min(1, ageDays / 365);
  return Number(score.toFixed(3));
}

function resolveNumeric(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}
