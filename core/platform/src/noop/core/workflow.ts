/**
 * @module @kb-labs/core-platform/noop/core/workflow
 * NoOp workflow engine implementation.
 */

import type {
  IWorkflowEngine,
  WorkflowOptions,
  WorkflowRun,
  WorkflowFilter,
} from '../../core/workflow.js';

/**
 * NoOp workflow engine that throws errors.
 * Workflows are critical core features - use real implementation.
 */
export class NoOpWorkflowEngine implements IWorkflowEngine {
  async execute(
    _workflowId: string,
    _input: unknown,
    _options?: WorkflowOptions
  ): Promise<WorkflowRun> {
    throw new Error(
      'Workflow engine not configured. Initialize platform with core-runtime.'
    );
  }

  async getStatus(_runId: string): Promise<WorkflowRun | null> {
    throw new Error(
      'Workflow engine not configured. Initialize platform with core-runtime.'
    );
  }

  async cancel(_runId: string): Promise<void> {
    throw new Error(
      'Workflow engine not configured. Initialize platform with core-runtime.'
    );
  }

  async retry(_runId: string, _fromStep?: string): Promise<WorkflowRun> {
    throw new Error(
      'Workflow engine not configured. Initialize platform with core-runtime.'
    );
  }

  async list(_filter?: WorkflowFilter): Promise<WorkflowRun[]> {
    throw new Error(
      'Workflow engine not configured. Initialize platform with core-runtime.'
    );
  }
}
