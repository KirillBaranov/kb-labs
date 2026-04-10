/**
 * Workflows API implementation
 *
 * Adapter from simplified WorkflowsAPI to full IWorkflowEngine interface.
 */

import type {
  ExecutionTarget,
  WorkflowsAPI,
  WorkflowRunOptions,
  WorkflowWaitOptions,
  WorkflowRunStatus,
  WorkflowListFilter,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';
import type { IWorkflowEngine, WorkflowRun } from '@kb-labs/core-platform';

export interface CreateWorkflowsAPIOptions {
  tenantId?: string;
  engine: IWorkflowEngine;
  permissions?: PermissionSpec;
  auditTargetExecution?: (params: {
    method: 'workflow';
    target: ExecutionTarget;
    workflowId: string;
  }) => Promise<void> | void;
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('*')) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return value === pattern;
}

function checkTargetPermission(
  permissions: PermissionSpec | undefined,
  options?: WorkflowRunOptions
): void {
  const target = options?.target;
  if (!target) {
    return;
  }

  if (!target.namespace) {
    throw new Error('Target namespace is required when workflow target is specified');
  }

  const executionPerms = permissions?.platform?.execution;
  if (executionPerms === false || executionPerms === undefined) {
    throw new Error(
      "Target execution denied: missing platform.execution.targetUse permission"
    );
  }

  if (executionPerms === true) {
    return;
  }

  if (!executionPerms.targetUse) {
    throw new Error(
      "Target execution denied: missing platform.execution.targetUse permission"
    );
  }

  if (executionPerms.namespaces?.length) {
    const allowed = executionPerms.namespaces.some(pattern =>
      matchesPattern(target.namespace!, pattern)
    );
    if (!allowed) {
      throw new Error(
        `Target namespace '${target.namespace}' denied: not in allowed execution namespaces scope`
      );
    }
  }
}

/**
 * Check if workflow operation is allowed by permissions
 */
function checkWorkflowPermission(
  permissions: PermissionSpec | undefined,
  operation: 'run' | 'list' | 'cancel',
  workflowId?: string
): void {
  const workflowPerms = permissions?.platform?.workflows;

  // If workflows is false or undefined, no access
  if (workflowPerms === false || workflowPerms === undefined) {
    throw new Error('Workflow engine access denied: missing platform.workflows permission');
  }

  // If workflows is true, all operations allowed
  if (workflowPerms === true) {
    return;
  }

  // If workflows is object, check specific operation
  if (typeof workflowPerms === 'object') {
    if (!workflowPerms[operation]) {
      throw new Error(
        `Workflow operation '${operation}' denied: missing platform.workflows.${operation} permission`
      );
    }

    // Check workflow ID scope if specified
    if (workflowId && workflowPerms.workflowIds) {
      const allowed = workflowPerms.workflowIds.some(pattern => {
        if (pattern === '*') {return true;}
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1);
          return workflowId.startsWith(prefix);
        }
        return pattern === workflowId;
      });

      if (!allowed) {
        throw new Error(
          `Workflow '${workflowId}' access denied: not in allowed workflowIds scope`
        );
      }
    }
  }
}

/**
 * Create WorkflowsAPI adapter
 *
 * Maps simplified plugin API to full workflow engine interface.
 */
export function createWorkflowsAPI(options: CreateWorkflowsAPIOptions): WorkflowsAPI {
  const { tenantId, engine, permissions, auditTargetExecution } = options;

  return {
    async run(
      workflowId: string,
      input?: unknown,
      options?: WorkflowRunOptions
    ): Promise<string> {
      checkWorkflowPermission(permissions, 'run', workflowId);
      checkTargetPermission(permissions, options);

      const target = options?.target;
      if (target) {
        try {
          await auditTargetExecution?.({
            method: 'workflow',
            target,
            workflowId,
          });
        } catch {
          // Audit failures must never block execution.
        }
      }

      const run = await engine.execute(workflowId, input, {
        tenantId,
        priority: options?.priority,
        timeout: options?.timeout,
        tags: options?.tags,
        ...(options?.target ? { target: options.target } : {}),
      });

      return run.id;
    },

    async wait(runId: string, options?: WorkflowWaitOptions): Promise<unknown> {
      const timeout = options?.timeout ?? 300000; // 5min default
      const pollInterval = options?.pollInterval ?? 1000; // 1s default
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const run = await engine.getStatus(runId);

        if (!run) {
          throw new Error(`Workflow run not found: ${runId}`);
        }

        if (run.status === 'completed') {
          return run.output;
        }

        if (run.status === 'failed') {
          throw new Error(`Workflow failed: ${run.error ?? 'Unknown error'}`);
        }

        if (run.status === 'cancelled') {
          throw new Error(`Workflow cancelled`);
        }

        // Still running, poll again after interval
        await new Promise(resolve => {
          setTimeout(resolve, pollInterval);
        });
      }

      throw new Error(`Workflow wait timeout after ${timeout}ms`);
    },

    async status(runId: string): Promise<WorkflowRunStatus | null> {
      checkWorkflowPermission(permissions, 'list');

      const run = await engine.getStatus(runId);

      if (!run) {
        return null;
      }

      return mapWorkflowRunToStatus(run);
    },

    async cancel(runId: string): Promise<void> {
      checkWorkflowPermission(permissions, 'cancel');
      await engine.cancel(runId);
    },

    async list(filter?: WorkflowListFilter): Promise<WorkflowRunStatus[]> {
      checkWorkflowPermission(permissions, 'list');

      const runs = await engine.list({
        workflowId: filter?.workflowId,
        tenantId, // Use adapter's tenantId, not from filter
        status: filter?.status,
        tags: filter?.tags,
        limit: filter?.limit,
        offset: filter?.offset,
      });

      return runs.map(mapWorkflowRunToStatus);
    },
  };
}

/**
 * Map internal WorkflowRun to simplified WorkflowRunStatus
 */
function mapWorkflowRunToStatus(run: WorkflowRun): WorkflowRunStatus {
  // Calculate progress based on completed steps
  let progress: number | undefined;
  if (run.steps.length > 0) {
    const completedSteps = run.steps.filter(
      s => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
    ).length;
    progress = Math.round((completedSteps / run.steps.length) * 100);
  }

  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    output: run.output,
    error: run.error,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    progress,
  };
}

/**
 * Create a no-op workflows API (for when workflow engine is not available)
 */
export function createNoopWorkflowsAPI(): WorkflowsAPI {
  const notAvailable = async (): Promise<never> => {
    throw new Error('Workflow engine not available');
  };

  return {
    run: notAvailable,
    wait: notAvailable,
    status: notAvailable,
    cancel: notAvailable,
    list: notAvailable,
  };
}
