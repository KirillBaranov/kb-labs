/**
 * EmbeddingStage - Generate embeddings for chunks
 *
 * Responsibilities:
 * - Receive chunks from ParallelChunkingStage
 * - Batch chunks for efficient API calls
 * - Call embedding provider with batched chunks
 * - Handle rate limits via RateLimiter
 * - Memory-efficient processing
 * - Progress reporting
 */

import type { PipelineStage, PipelineContext, StageResult } from '../pipeline-types';
import type { MindChunk } from './types';
import type {
  RateLimiter} from '../../rate-limiting/index';
import {
  type RateLimitConfig,
  type RateLimitPreset,
  getRateLimitConfig,
  estimateBatchTokens,
  createRateLimiter,
} from '../../rate-limiting/index';

export interface ChunkWithEmbedding extends MindChunk {
  embedding: number[];
}

export interface EmbeddingProvider {
  /**
   * Generate embeddings for multiple texts in one API call
   * @param texts Array of texts to embed
   * @returns Array of embedding vectors
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Maximum batch size supported by this provider
   */
  readonly maxBatchSize: number;

  /**
   * Embedding dimension
   */
  readonly dimension: number;

  /**
   * Optional: Rate limit configuration for this provider
   * If not provided, default OpenAI tier-2 limits will be used
   */
  readonly rateLimits?: RateLimitConfig;
}

interface EmbeddingEntry {
  chunk: MindChunk;
  text: string;
}

export interface EmbeddingStageOptions {
  /**
   * Chunks per batch (default: auto-calculated based on rate limits)
   */
  batchSize?: number;

  /**
   * Max retries per batch on transient errors (default: 3)
   */
  maxRetries?: number;

  /**
   * Initial delay between retries in ms (default: 1000)
   */
  retryDelay?: number;

  /**
   * Maximum parallel API calls (default: 5)
   * Rate limiter will control actual concurrency based on available capacity
   */
  maxConcurrency?: number;

  /**
   * Rate limit configuration or preset name
   * Examples: 'openai-tier-2', 'sber-gigachat', 'ollama-local'
   * Or custom RateLimitConfig object
   */
  rateLimits?: RateLimitConfig | RateLimitPreset;
}

/**
 * Embedding Stage
 * Generates embeddings for chunks using batched API calls with rate limiting
 */
export class EmbeddingStage implements PipelineStage {
  readonly name = 'embedding';
  readonly description = 'Generate embeddings for chunks';

  private chunksWithEmbeddings: ChunkWithEmbedding[] = [];
  private rateLimiter: RateLimiter;

  constructor(
    private embeddingProvider: EmbeddingProvider,
    private chunks: MindChunk[],
    private options: EmbeddingStageOptions = {}
  ) {
    // Initialize rate limiter from options or provider config
    const rateLimitConfig = getRateLimitConfig(
      options.rateLimits ?? embeddingProvider.rateLimits
    );
    this.rateLimiter = createRateLimiter(rateLimitConfig);
  }

  async execute(context: PipelineContext): Promise<StageResult> {
    if (this.chunks.length === 0) {
      context.logger.warn('No chunks to embed');
      return {
        success: true,
        message: 'No chunks to process',
      };
    }

    const maxConcurrency = this.options.maxConcurrency ?? 5;
    const batchSize = this.calculateBatchSize();

    context.logger.debug('Generating embeddings with rate limiting', {
      chunksCount: this.chunks.length,
      provider: this.embeddingProvider.constructor.name,
      dimension: this.embeddingProvider.dimension,
      batchSize,
      maxConcurrency,
    });

    // Prepare batches
    const batches: { chunks: MindChunk[]; index: number }[] = [];
    for (let i = 0; i < this.chunks.length; i += batchSize) {
      batches.push({
        chunks: this.chunks.slice(i, i + batchSize),
        index: i,
      });
    }

    // Results storage (ordered by batch index)
    const results: ChunkWithEmbedding[][] = new Array(batches.length);
    let processedCount = 0;
    let errorCount = 0;
    let nextBatchIndex = 0;
    const mutex = { locked: false };

    // Worker function - processes batches until none left
    const processBatches = async (): Promise<void> => {
      while (true) {
        // Atomically get next batch index
        while (mutex.locked) {
          await this.sleep(1);
        }
        mutex.locked = true;
        const currentIndex = nextBatchIndex;
        if (currentIndex >= batches.length) {
          mutex.locked = false;
          break;
        }
        nextBatchIndex++;
        mutex.locked = false;

        const batchItem = batches[currentIndex];
        if (!batchItem) {
          throw new Error(`Batch at index ${currentIndex} is undefined`);
        }
        const { chunks: batch, index: batchStart } = batchItem;
        const validEntries: EmbeddingEntry[] = [];
        for (let idx = 0; idx < batch.length; idx++) {
          const chunk = batch[idx];
          if (!chunk) {
            continue;
          }
          const sanitizedText = this.sanitizeEmbeddingText(chunk.text);
          if (!sanitizedText) {
            context.stats.errors.push({
              file: chunk.path,
              error: 'Embedding skipped: empty or invalid chunk text',
            });
            errorCount += 1;
            continue;
          }
          validEntries.push({ chunk, text: sanitizedText });
        }

        if (validEntries.length === 0) {
          results[currentIndex] = [];
          continue;
        }
        const texts = validEntries.map(entry => entry.text);

        // Estimate tokens for this batch
        const estimatedTokens = estimateBatchTokens(texts);

        // Wait for rate limiter capacity
        await this.rateLimiter.acquire(estimatedTokens);

        context.logger.debug('Processing embedding batch', {
          batchIndex: currentIndex,
          batchStart,
          batchSize: batch.length,
          estimatedTokens,
          progress: `${currentIndex + 1}/${batches.length}`,
        });

        try {
          // Embed batch with retry logic
          const embeddings = await this.embedBatchWithRetry(texts, context);

          // Release rate limiter slot
          this.rateLimiter.release();

          // Combine chunks with embeddings
          const batchResults: ChunkWithEmbedding[] = [];
          for (let j = 0; j < validEntries.length; j++) {
            const embedding = embeddings[j];
            const entry = validEntries[j];
            const chunk = entry?.chunk;
            if (embedding && chunk) {
              batchResults.push({
                ...chunk,
                chunkId: chunk.chunkId ?? '',
                sourceId: chunk.sourceId ?? '',
                path: chunk.path ?? '',
                embedding,
              });
            }
          }
          results[currentIndex] = batchResults;

          // Update progress (atomic increment)
          while (mutex.locked) {
            await this.sleep(1);
          }
          mutex.locked = true;
          processedCount += validEntries.length;
          const currentProcessed = processedCount;
          mutex.locked = false;

          // Report progress with rate limiter stats
          if (context.onProgress && currentProcessed % 100 === 0) {
            const rlStats = this.rateLimiter.getStats();
            context.onProgress({
              stage: this.name,
              current: currentProcessed,
              total: this.chunks.length,
              message: `Embedded ${currentProcessed}/${this.chunks.length} chunks (waits: ${rlStats.waitCount})`,
            });
          }

          // Force GC periodically
          if (currentProcessed % 500 === 0 && global.gc) {
            global.gc();
          }

          // Apply memory backpressure
          await context.memoryMonitor.applyBackpressure();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const isInvalidInput = this.isInvalidInputError(errorMessage);

          // Recover from invalid input by recursively splitting batch.
          if (isInvalidInput && validEntries.length > 1) {
            context.logger.warn('Embedding batch contains invalid input, isolating bad chunks', {
              batchIndex: currentIndex,
              batchSize: batch.length,
              validEntries: validEntries.length,
            });

            const recovered = await this.embedEntriesWithSplit(validEntries, context);
            const recoveredResults = recovered.results;
            errorCount += recovered.failed;

            // Release rate limiter slot on recovery path as well
            this.rateLimiter.release();
            results[currentIndex] = recoveredResults;

            while (mutex.locked) {
              await this.sleep(1);
            }
            mutex.locked = true;
            processedCount += recoveredResults.length;
            mutex.locked = false;
            continue;
          }

          // Release rate limiter slot on error
          this.rateLimiter.release();

          // Update error count (atomic)
          while (mutex.locked) {
            await this.sleep(1);
          }
          mutex.locked = true;
          errorCount += validEntries.length;
          const currentErrors = context.stats.errors.length;
          mutex.locked = false;

          // Log error for this batch
          context.logger.error('Failed to embed batch', {
            batchIndex: currentIndex,
            batchSize: batch.length,
            error: errorMessage,
          });

          // Add to error stats
          for (const chunk of validEntries.map(entry => entry.chunk)) {
            context.stats.errors.push({
              file: chunk.path,
              error: `Embedding failed: ${errorMessage}`,
            });
          }

          // Store empty array for failed batch
          results[currentIndex] = [];

          // Check if too many errors
          if (currentErrors >= 100) {
            context.logger.error('Too many embedding errors, aborting');
            break;
          }
        }
      }
    };

    // Launch parallel workers
    const workers = Array(Math.min(maxConcurrency, batches.length))
      .fill(null)
      .map(() => processBatches());

    await Promise.all(workers);

    // Flatten results in order
    this.chunksWithEmbeddings = results.flat().filter(Boolean);

    // Update context stats
    context.embeddingsGenerated = processedCount;
    context.stats.totalChunks = this.chunksWithEmbeddings.length;

    // Log final rate limiter stats
    const rlStats = this.rateLimiter.getStats();
    context.logger.debug('Embedding complete', {
      chunksProcessed: processedCount,
      chunksFailed: errorCount,
      totalEmbeddings: this.chunksWithEmbeddings.length,
      parallelWorkers: maxConcurrency,
      rateLimiterWaits: rlStats.waitCount,
      rateLimiterWaitTime: `${(rlStats.totalWaitTime / 1000).toFixed(1)}s`,
      totalTokensUsed: rlStats.totalTokens,
    });

    return {
      success: errorCount === 0,
      message: `Generated ${processedCount} embeddings (${errorCount} failed)`,
      data: {
        chunksProcessed: processedCount,
        chunksFailed: errorCount,
        totalEmbeddings: this.chunksWithEmbeddings.length,
        rateLimiterStats: rlStats,
      },
    };
  }

  /**
   * Embed batch with retry logic
   */
  private async embedBatchWithRetry(
    texts: string[],
    context: PipelineContext
  ): Promise<number[][]> {
    const maxRetries = this.options.maxRetries ?? 3;
    const retryDelay = this.options.retryDelay ?? 1000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.embeddingProvider.embedBatch(texts);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Invalid input is deterministic - retries won't help.
        if (this.isInvalidInputError(lastError.message)) {
          throw lastError;
        }

        // Check if it's a rate limit error - if so, the rate limiter will handle it
        const isRateLimit = lastError.message.toLowerCase().includes('rate limit');

        if (attempt < maxRetries) {
          // Exponential backoff (longer for rate limit errors)
          const baseDelay = isRateLimit ? retryDelay * 2 : retryDelay;
          const delay = baseDelay * Math.pow(2, attempt);

          context.logger.warn('Embedding batch failed, retrying', {
            attempt: attempt + 1,
            maxRetries,
            delay: `${delay}ms`,
            isRateLimit,
            error: lastError.message,
          });

          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to embed batch after ${maxRetries} retries: ${lastError?.message}`
    );
  }

  /**
   * Calculate optimal batch size based on rate limits
   */
  private calculateBatchSize(): number {
    const userBatchSize = this.options.batchSize;
    const providerMaxBatch = this.embeddingProvider.maxBatchSize;

    // Use user preference if provided
    if (userBatchSize !== undefined) {
      return Math.min(userBatchSize, providerMaxBatch);
    }

    // Calculate based on rate limiter capacity
    // Average chunk is ~500 tokens, aim for ~100K tokens per batch for good throughput
    const avgTokensPerChunk = 500;
    const targetTokensPerBatch = 100_000;
    const optimalByTokens = Math.floor(targetTokensPerBatch / avgTokensPerChunk);

    // Return min of optimal and provider max
    return Math.min(optimalByTokens, providerMaxBatch, 500);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => { setTimeout(resolve, ms); });
  }

  private sanitizeEmbeddingText(text: unknown): string | null {
    if (typeof text !== 'string') {
      return null;
    }

    // Strip problematic control chars and normalize invalid UTF-16 sequences.
    const noNulls = text.replace(/\u0000/g, '');
    const normalized = Buffer.from(noNulls, 'utf8').toString('utf8').trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isInvalidInputError(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('$.input') || lower.includes('invalid input');
  }

  private async embedEntriesWithSplit(
    entries: EmbeddingEntry[],
    context: PipelineContext,
  ): Promise<{ results: ChunkWithEmbedding[]; failed: number }> {
    if (entries.length === 0) {
      return { results: [], failed: 0 };
    }

    try {
      const embeddings = await this.embedBatchWithRetry(entries.map(entry => entry.text), context);
      const results: ChunkWithEmbedding[] = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const embedding = embeddings[i];
        if (!entry || !embedding) {
          continue;
        }
        results.push({
          ...entry.chunk,
          chunkId: entry.chunk.chunkId ?? '',
          sourceId: entry.chunk.sourceId ?? '',
          path: entry.chunk.path ?? '',
          embedding,
        });
      }
      return { results, failed: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.isInvalidInputError(message)) {
        throw error;
      }

      if (entries.length === 1) {
        const entry = entries[0];
        context.stats.errors.push({
          file: entry?.chunk.path ?? '<unknown>',
          error: `Embedding failed (invalid input): ${message}`,
        });
        context.logger.warn('Dropped invalid embedding chunk', {
          chunkId: entry?.chunk.chunkId,
          path: entry?.chunk.path,
          textLength: entry?.text.length ?? 0,
          textPreview: (entry?.text ?? '').slice(0, 120),
        });
        return { results: [], failed: 1 };
      }

      const middle = Math.floor(entries.length / 2);
      const left = await this.embedEntriesWithSplit(entries.slice(0, middle), context);
      const right = await this.embedEntriesWithSplit(entries.slice(middle), context);
      return {
        results: [...left.results, ...right.results],
        failed: left.failed + right.failed,
      };
    }
  }

  /**
   * Get chunks with embeddings (for next stage)
   */
  getChunksWithEmbeddings(): ReadonlyArray<ChunkWithEmbedding> {
    return this.chunksWithEmbeddings;
  }

  /**
   * Get rate limiter for external monitoring
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }

  /**
   * Optional: Cleanup
   */
  async cleanup(context: PipelineContext): Promise<void> {
    context.logger.debug('Embedding stage cleanup', {
      chunksInMemory: this.chunksWithEmbeddings.length,
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
      embeddingsGenerated: this.chunksWithEmbeddings.length,
    };
  }
}
