/**
 * Workflows API for V3 Plugin System
 *
 * Simplified API for running background workflows in separate processes.
 * Workflows persist in distributed cache (ICache), enabling fire-and-forget execution.
 */
import type { ExecutionTarget } from './execution-target.js';

// ============================================================================
// Workflow Run Options
// ============================================================================

/**
 * Options for running a workflow
 */
export interface WorkflowRunOptions {
  /**
   * Execution priority
   */
  priority?: 'low' | 'normal' | 'high' | 'critical';

  /**
   * Execution timeout in milliseconds
   */
  timeout?: number;

  /**
   * Idempotency key to prevent duplicate runs
   */
  idempotencyKey?: string;

  /**
   * Custom tags for tracking
   */
  tags?: Record<string, string>;

  /**
   * Optional execution target affinity.
   * When provided, platform should execute workflow in this target context.
   */
  target?: ExecutionTarget;
}

/**
 * Options for waiting on workflow completion
 */
export interface WorkflowWaitOptions {
  /**
   * Maximum time to wait in milliseconds
   */
  timeout?: number;

  /**
   * Poll interval in milliseconds (default 1000)
   */
  pollInterval?: number;
}

// ============================================================================
// Workflow Status
// ============================================================================

/**
 * Workflow execution status
 */
export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Workflow run status information
 */
export interface WorkflowRunStatus {
  /**
   * Run identifier
   */
  id: string;

  /**
   * Workflow definition identifier
   */
  workflowId: string;

  /**
   * Current status
   */
  status: WorkflowStatus;

  /**
   * Workflow output (available when completed)
   */
  output?: unknown;

  /**
   * Error message (available when failed)
   */
  error?: string;

  /**
   * Run start time
   */
  startedAt?: Date;

  /**
   * Run completion time
   */
  completedAt?: Date;

  /**
   * Progress percentage (0-100)
   */
  progress?: number;
}

// ============================================================================
// Workflow List Filter
// ============================================================================

/**
 * Filter for listing workflow runs
 */
export interface WorkflowListFilter {
  /**
   * Filter by workflow ID
   */
  workflowId?: string;

  /**
   * Filter by status
   */
  status?: WorkflowStatus;

  /**
   * Filter by tags
   */
  tags?: Record<string, string>;

  /**
   * Limit results (default 50)
   */
  limit?: number;

  /**
   * Offset for pagination
   */
  offset?: number;
}

// ============================================================================
// Workflows API
// ============================================================================

/**
 * API for running background workflows
 *
 * Use cases:
 * - Fire-and-forget: Start workflow, plugin handler returns immediately
 * - Poll status: Check workflow progress from another plugin invocation
 * - Wait for completion: Block until workflow finishes (with timeout)
 *
 * State is persisted in platform cache (Redis/Memory), so workflows survive
 * plugin process termination and are executed by separate worker processes.
 */
export interface WorkflowsAPI {
  /**
   * Run a workflow in the background
   *
   * Returns immediately with run ID. Workflow executes asynchronously
   * in a separate worker process.
   *
   * @param workflowId - Workflow definition identifier
   * @param input - Workflow input data
   * @param options - Execution options
   * @returns Run identifier for tracking status
   *
   * @example
   * ```typescript
   * // Fire-and-forget
   * const runId = await ctx.api.workflows.run('analyze-codebase', { path: './src' });
   * return { runId }; // Plugin handler returns, workflow continues in worker
   * ```
   */
  run(workflowId: string, input?: unknown, options?: WorkflowRunOptions): Promise<string>;

  /**
   * Wait for workflow completion
   *
   * Blocks until workflow finishes or timeout is reached.
   * Polls status at regular intervals.
   *
   * @param runId - Run identifier from run()
   * @param options - Wait options
   * @returns Workflow output
   * @throws Error if workflow fails or timeout is reached
   *
   * @example
   * ```typescript
   * // Wait for completion (with 5min timeout)
   * const runId = await ctx.api.workflows.run('analyze-codebase', { path: './src' });
   * const result = await ctx.api.workflows.wait(runId, { timeout: 300000 });
   * return result;
   * ```
   */
  wait(runId: string, options?: WorkflowWaitOptions): Promise<unknown>;

  /**
   * Get workflow run status
   *
   * @param runId - Run identifier
   * @returns Status information or null if not found
   *
   * @example
   * ```typescript
   * // Poll status from another plugin invocation
   * const status = await ctx.api.workflows.status(runId);
   * if (status?.status === 'completed') {
   *   return status.output;
   * }
   * ```
   */
  status(runId: string): Promise<WorkflowRunStatus | null>;

  /**
   * Cancel a running workflow
   *
   * @param runId - Run identifier
   *
   * @example
   * ```typescript
   * await ctx.api.workflows.cancel(runId);
   * ```
   */
  cancel(runId: string): Promise<void>;

  /**
   * List workflow runs
   *
   * @param filter - Optional filter criteria
   * @returns List of workflow runs
   *
   * @example
   * ```typescript
   * // List recent runs for a workflow
   * const runs = await ctx.api.workflows.list({
   *   workflowId: 'analyze-codebase',
   *   limit: 10
   * });
   * ```
   */
  list(filter?: WorkflowListFilter): Promise<WorkflowRunStatus[]>;
}
