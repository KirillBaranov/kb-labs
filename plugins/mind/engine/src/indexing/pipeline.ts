/**
 * IndexingPipeline - Orchestrates the indexing process through stages
 *
 * This pipeline breaks down the monolithic index() function into
 * independent, testable stages with clear responsibilities.
 */

import type {
  PipelineStage,
  PipelineContext,
  PipelineConfig,
  PipelineResult,
  CheckpointData,
} from './pipeline-types';

/**
 * Indexing Pipeline Orchestrator
 *
 * Executes stages sequentially:
 * 1. FileDiscoveryStage - Find files to index
 * 2. ParallelChunkingStage - Convert files to chunks
 * 3. EmbeddingStage - Generate embeddings
 * 4. StorageStage - Store in vector DB
 */
export class IndexingPipeline {
  private stages: PipelineStage[] = [];
  private config: Required<PipelineConfig>;

  constructor(config: PipelineConfig = {}) {
    // Set defaults
    this.config = {
      memoryLimit: config.memoryLimit ?? 4 * 1024 * 1024 * 1024, // 4GB default
      batchSize: config.batchSize ?? 20,
      workers: config.workers ?? 1,
      checkpointInterval: config.checkpointInterval ?? 1000,
      checkpointDir: config.checkpointDir ?? '.kb/mind/checkpoints',
      continueOnError: config.continueOnError ?? true,
      maxErrors: config.maxErrors ?? 100,
      gcInterval: config.gcInterval ?? 10,
    };
  }

  /**
   * Add a stage to the pipeline
   */
  addStage(stage: PipelineStage): this {
    this.stages.push(stage);
    return this;
  }

  /**
   * Execute the entire pipeline
   */
  async execute(context: PipelineContext): Promise<PipelineResult> {
    const startTime = Date.now();

    context.logger.debug('Pipeline started', {
      stages: this.stages.map(s => s.name),
      sources: context.sources.length,
    });

    try {
      // Execute each stage sequentially
      for (const stage of this.stages) {
        await this.executeStage(stage, context);

        // Check if we should abort
        if (context.stats.errors.length >= this.config.maxErrors) {
          context.logger.error('Too many errors, aborting pipeline', {
            errorCount: context.stats.errors.length,
            maxErrors: this.config.maxErrors,
          });
          break;
        }
      }

      const duration = Date.now() - startTime;

      context.logger.debug('Pipeline completed', {
        duration: `${(duration / 1000).toFixed(2)}s`,
        filesProcessed: context.stats.filesProcessed,
        filesSkipped: context.stats.filesSkipped,
        totalChunks: context.stats.totalChunks,
        errors: context.stats.errors.length,
      });

      return {
        success: context.stats.errors.length === 0,
        stats: context.stats,
        errors: context.stats.errors,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      context.logger.error('Pipeline failed', {
        error: error instanceof Error ? error.message : String(error),
        duration: `${(duration / 1000).toFixed(2)}s`,
      });

      return {
        success: false,
        stats: context.stats,
        errors: [
          ...context.stats.errors,
          {
            file: 'pipeline',
            error: error instanceof Error ? error.message : String(error),
          },
        ],
        duration,
      };
    }
  }

  /**
   * Execute a single stage with hooks
   */
  private async executeStage(
    stage: PipelineStage,
    context: PipelineContext
  ): Promise<void> {
    const stageStartTime = Date.now();

    context.logger.debug(`Stage: ${stage.name}`, {
      status: 'starting',
      description: stage.description,
    });

    try {
      // Prepare hook
      if (stage.prepare) {
        await stage.prepare(context);
      }

      // Execute stage
      const result = await stage.execute(context);

      // Log result
      const duration = Date.now() - stageStartTime;
      context.logger.debug(`Stage: ${stage.name}`, {
        status: result.success ? 'completed' : 'failed',
        duration: `${(duration / 1000).toFixed(2)}s`,
        message: result.message,
        ...result.data,
      });

      // Report progress
      if (context.onProgress) {
        context.onProgress({
          stage: stage.name,
          current: context.stats.filesProcessed,
          total: context.stats.filesDiscovered,
          message: result.message,
        });
      }

      // Cleanup hook
      if (stage.cleanup) {
        await stage.cleanup(context);
      }
    } catch (error) {
      const duration = Date.now() - stageStartTime;

      context.logger.error(`Stage: ${stage.name}`, {
        status: 'failed',
        duration: `${(duration / 1000).toFixed(2)}s`,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Create checkpoint for progress persistence
   */
  async createCheckpoint(context: PipelineContext): Promise<CheckpointData> {
    const checkpoints: CheckpointData[] = [];

    for (const stage of this.stages) {
      if (stage.checkpoint) {
        const checkpoint = await stage.checkpoint(context);
        checkpoints.push(checkpoint);
      }
    }

    // Return combined checkpoint (latest stage)
    return checkpoints[checkpoints.length - 1] ?? {
      stage: 'none',
      processedFiles: [],
      stats: context.stats,
      timestamp: Date.now(),
    };
  }

  /**
   * Restore from checkpoint
   */
  async restoreFromCheckpoint(
    checkpoint: CheckpointData,
    context: PipelineContext
  ): Promise<void> {
    context.logger.debug('Restoring from checkpoint', {
      stage: checkpoint.stage,
      processedFiles: checkpoint.processedFiles.length,
      timestamp: new Date(checkpoint.timestamp).toISOString(),
    });

    // Find the stage to restore
    for (const stage of this.stages) {
      if (stage.name === checkpoint.stage && stage.restore) {
        await stage.restore(checkpoint, context);
        break;
      }
    }
  }

  /**
   * Get pipeline configuration
   */
  getConfig(): Readonly<Required<PipelineConfig>> {
    return { ...this.config };
  }
}

/**
 * Create a default indexing pipeline
 * Adds all standard stages in order
 */
export function createDefaultPipeline(
  config: PipelineConfig = {}
): IndexingPipeline {
  // Note: Stages are added by the caller
  // This factory just creates the pipeline infrastructure

  return new IndexingPipeline(config);
}
