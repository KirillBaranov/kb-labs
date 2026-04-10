/**
 * @module @kb-labs/core-runtime/run-executor
 * Bridge between run orchestration and execution backend.
 */

import type {
  IExecutionBackend,
  ExecutionRequest,
  ExecutionResult,
} from '@kb-labs/core-contracts';

/**
 * Request for run step execution.
 */
export interface RunStepExecutionRequest {
  runId: string;
  stepId: string;
  environmentId?: string;
  execution: ExecutionRequest;
}

/**
 * Run executor that enriches execution metadata with run/environment context.
 */
export class RunExecutor {
  constructor(
    private readonly executionBackend: IExecutionBackend,
    private readonly logger: { debug(message: string, meta?: Record<string, unknown>): void }
  ) {}

  /**
   * Execute one run step through the shared execution backend.
   */
  async executeStep(request: RunStepExecutionRequest): Promise<ExecutionResult> {
    const { runId, stepId, environmentId, execution } = request;

    this.logger.debug('RunExecutor: executing step', {
      runId,
      stepId,
      environmentId,
      executionId: execution.executionId,
      pluginRoot: execution.pluginRoot,
      handlerRef: execution.handlerRef,
    });

    return this.executionBackend.execute({
      ...execution,
      context: {
        ...execution.context,
        run: {
          runId,
          stepId,
          environmentId,
        },
      },
    });
  }
}
