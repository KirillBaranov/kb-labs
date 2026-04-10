/**
 * @module @kb-labs/core-contracts
 *
 * Execution backend interfaces - contract for execution layer.
 */

import type { ExecutionRequest } from "./execution-request.js";
import type {
  ExecutionResult,
  ExecuteOptions,
} from "./execution-response.js";

/**
 * Health status for execution backend.
 */
export interface HealthStatus {
  /** Backend is healthy */
  healthy: boolean;

  /** Backend type */
  backend: "in-process" | "subprocess" | "worker-pool" | "remote";

  /** Additional health details */
  details?: Record<string, unknown>;
}

/**
 * Execution statistics.
 */
export interface ExecutionStats {
  /** Total executions */
  totalExecutions: number;

  /** Successful executions */
  successCount: number;

  /** Failed executions */
  errorCount: number;

  /** Average execution time in ms */
  avgExecutionTimeMs: number;

  /** P95 execution time in ms */
  p95ExecutionTimeMs?: number;

  /** P99 execution time in ms */
  p99ExecutionTimeMs?: number;
}

/**
 * Execution backend interface.
 *
 * Implemented by backends in @kb-labs/plugin-execution.
 * Used by @kb-labs/core-runtime and CLI/REST hosts.
 */
export interface IExecutionBackend<TDescriptor = unknown> {
  /**
   * Execute a plugin handler.
   *
   * Returns ExecutionResult on success, ExecutionError on failure.
   * Never throws - all errors are caught and returned as ExecutionError.
   */
  execute(
    request: ExecutionRequest<TDescriptor>,
    options?: ExecuteOptions,
  ): Promise<ExecutionResult>;

  /**
   * Get backend health status.
   */
  health(): Promise<HealthStatus>;

  /**
   * Get execution statistics.
   */
  stats(): Promise<ExecutionStats>;

  /**
   * Shutdown backend and cleanup resources.
   */
  shutdown(): Promise<void>;
}
