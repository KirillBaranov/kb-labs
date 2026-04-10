/**
 * Pipeline types and interfaces for modular indexing
 *
 * This module defines the contracts for the indexing pipeline stages.
 * Each stage is independent, testable, and composable.
 */

import type { KnowledgeSource } from '../types/engine-contracts';
import type { MemoryMonitor } from './memory-monitor';

/**
 * Logger interface for structured logging
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Progress reporter interface
 */
export interface ProgressReporter {
  (progress: {
    stage: string;
    current: number;
    total: number;
    message?: string;
  }): void;
}

/**
 * Context passed between pipeline stages
 * Contains all data needed for processing
 */
export interface PipelineContext {
  // Input
  sources: KnowledgeSource[];
  scopeId: string;

  // Runtime
  logger: Logger;
  memoryMonitor: MemoryMonitor;
  workspaceRoot?: string;
  onProgress?: ProgressReporter;
  indexRevision?: string;
  indexedAt?: number;

  // Stage outputs (populated as pipeline progresses)
  filePaths?: string[];           // From FileDiscoveryStage
  chunksProcessed?: number;       // From ParallelChunkingStage
  embeddingsGenerated?: number;   // From EmbeddingStage
  chunksStored?: number;          // From StorageStage

  // Statistics
  stats: {
    filesDiscovered: number;
    filesProcessed: number;
    filesSkipped: number;
    totalChunks: number;
    startTime: number;
    errors: Array<{ file: string; error: string }>;
  };
}

/**
 * Result from a pipeline stage execution
 */
export interface StageResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Checkpoint data for progress persistence
 */
export interface CheckpointData {
  stage: string;
  processedFiles: string[];
  stats: PipelineContext['stats'];
  timestamp: number;
}

/**
 * Pipeline stage interface
 * Each stage implements this contract
 */
export interface PipelineStage {
  /** Stage name for logging */
  readonly name: string;

  /** Stage description */
  readonly description?: string;

  /**
   * Execute the stage
   * @param context Pipeline context (mutable)
   * @returns Promise that resolves when stage completes
   */
  execute(context: PipelineContext): Promise<StageResult>;

  /**
   * Optional: Prepare stage before execution
   * Use for setup, validation, resource allocation
   */
  prepare?(context: PipelineContext): Promise<void>;

  /**
   * Optional: Cleanup after stage execution
   * Use for resource cleanup, final logging
   */
  cleanup?(context: PipelineContext): Promise<void>;

  /**
   * Optional: Create checkpoint for progress persistence
   */
  checkpoint?(context: PipelineContext): Promise<CheckpointData>;

  /**
   * Optional: Restore from checkpoint
   */
  restore?(data: CheckpointData, context: PipelineContext): Promise<void>;
}

/**
 * Configuration for pipeline execution
 */
export interface PipelineConfig {
  // Memory management
  memoryLimit?: number;           // In bytes
  batchSize?: number;             // Files per batch

  // Parallelization
  workers?: number;               // Worker pool size

  // Progress persistence
  checkpointInterval?: number;    // Files between checkpoints
  checkpointDir?: string;         // Where to save checkpoints

  // Error handling
  continueOnError?: boolean;      // Continue if individual files fail
  maxErrors?: number;             // Max errors before aborting

  // Performance
  gcInterval?: number;            // Force GC every N chunks
}

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  success: boolean;
  stats: PipelineContext['stats'];
  errors: Array<{ file: string; error: string }>;
  duration: number; // milliseconds
}
