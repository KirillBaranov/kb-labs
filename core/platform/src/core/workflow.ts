/**
 * @module @kb-labs/core-platform/core/workflow
 * Workflow engine interface for orchestrating multi-step processes.
 */

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
}

/**
 * Workflow execution options.
 */
export interface WorkflowExecutionTarget {
  /** Target environment identifier */
  environmentId?: string;
  /** Target workspace identifier */
  workspaceId?: string;
  /** Namespace boundary */
  namespace?: string;
  /** Working directory override */
  workdir?: string;
}

export interface WorkflowOptions {
  /** Tenant identifier for multi-tenancy */
  tenantId?: string;
  /** Execution priority */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Retry policy for failed steps */
  retryPolicy?: RetryPolicy;
  /** Custom tags for tracking */
  tags?: Record<string, string>;
  /** Optional execution target affinity */
  target?: WorkflowExecutionTarget;
}

/**
 * Workflow step execution status.
 */
export interface WorkflowStepRun {
  /** Step identifier */
  id: string;
  /** Step name */
  name: string;
  /** Execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** Step input */
  input?: unknown;
  /** Step output */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Step start time */
  startedAt?: Date;
  /** Step completion time */
  completedAt?: Date;
}

/**
 * Workflow execution run.
 */
export interface WorkflowRun {
  /** Run identifier */
  id: string;
  /** Workflow definition identifier */
  workflowId: string;
  /** Tenant identifier */
  tenantId: string;
  /** Execution status */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Workflow input */
  input: unknown;
  /** Workflow output (from last step) */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Run start time */
  startedAt?: Date;
  /** Run completion time */
  completedAt?: Date;
  /** Individual step runs */
  steps: WorkflowStepRun[];
}

/**
 * Filter for listing workflow runs.
 */
export interface WorkflowFilter {
  /** Filter by workflow ID */
  workflowId?: string;
  /** Filter by tenant */
  tenantId?: string;
  /** Filter by status */
  status?: WorkflowRun['status'];
  /** Filter by tags */
  tags?: Record<string, string>;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Workflow engine interface.
 * Core feature - implemented in @kb-labs/core-runtime, not replaceable.
 */
export interface IWorkflowEngine {
  /**
   * Execute a workflow.
   * @param workflowId - Workflow definition identifier
   * @param input - Workflow input data
   * @param options - Execution options
   */
  execute(workflowId: string, input: unknown, options?: WorkflowOptions): Promise<WorkflowRun>;

  /**
   * Get workflow run status.
   * @param runId - Run identifier
   */
  getStatus(runId: string): Promise<WorkflowRun | null>;

  /**
   * Cancel a running workflow.
   * @param runId - Run identifier
   */
  cancel(runId: string): Promise<void>;

  /**
   * Retry a failed workflow.
   * @param runId - Run identifier
   * @param fromStep - Optional step to retry from
   */
  retry(runId: string, fromStep?: string): Promise<WorkflowRun>;

  /**
   * List workflow runs.
   * @param filter - Optional filter criteria
   */
  list(filter?: WorkflowFilter): Promise<WorkflowRun[]>;
}
