/**
 * @module @kb-labs/core-runtime/core/workflow-engine
 * In-memory workflow engine with step execution.
 */

import type {
  IWorkflowEngine,
  WorkflowOptions,
  WorkflowRun,
  WorkflowStepRun,
  WorkflowFilter,
  RetryPolicy,
  IResourceManager,
  IStorage,
  IEventBus,
  ILogger,
} from '@kb-labs/core-platform';

export interface WorkflowEngineConfig {
  /** Maximum concurrent workflows globally (default: 5) */
  maxConcurrent?: number;
  /** Default workflow timeout in ms (default: 300000 = 5min) */
  defaultTimeout?: number;
}

/**
 * Workflow definition (registered workflows).
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStepDefinition[];
}

/**
 * Workflow step definition.
 */
export interface WorkflowStepDefinition {
  id: string;
  name: string;
  handler: (input: unknown, context: WorkflowStepContext) => Promise<unknown>;
  continueOnError?: boolean;
  timeout?: number;
}

/**
 * Context passed to step handlers.
 */
export interface WorkflowStepContext {
  workflowId: string;
  runId: string;
  stepId: string;
  tenantId: string;
  previousStepOutput?: unknown;
}

/**
 * Internal workflow run representation.
 */
interface InternalWorkflowRun extends WorkflowRun {
  definition: WorkflowDefinition;
  options: WorkflowOptions;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * In-memory workflow engine.
 */
export class WorkflowEngine implements IWorkflowEngine {
  private runs = new Map<string, InternalWorkflowRun>();
  private definitions = new Map<string, WorkflowDefinition>();
  private running = new Set<string>();
  private idCounter = 0;
  private readonly config: Required<WorkflowEngineConfig>;

  constructor(
    private resources: IResourceManager,
    private storage: IStorage,
    private events: IEventBus,
    private logger: ILogger,
    config: WorkflowEngineConfig = {}
  ) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 5,
      defaultTimeout: config.defaultTimeout ?? 300000,
    };
  }

  /**
   * Register a workflow definition.
   */
  registerWorkflow(definition: WorkflowDefinition): void {
    this.definitions.set(definition.id, definition);
    this.logger.info('Workflow registered', {
      workflowId: definition.id,
      steps: definition.steps.length,
    });
  }

  /**
   * Unregister a workflow definition.
   */
  unregisterWorkflow(workflowId: string): void {
    this.definitions.delete(workflowId);
  }

  async execute(
    workflowId: string,
    input: unknown,
    options?: WorkflowOptions
  ): Promise<WorkflowRun> {
    const definition = this.definitions.get(workflowId);
    if (!definition) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const tenantId = options?.tenantId ?? 'default';
    const timeout = options?.timeout ?? this.config.defaultTimeout;

    // Try to acquire resource slot
    const slot = await this.resources.acquireSlot('workflow', tenantId, timeout);
    if (!slot) {
      throw new Error(`Workflow quota exceeded for tenant: ${tenantId}`);
    }

    const runId = `run-${++this.idCounter}-${Date.now()}`;
    const now = new Date();

    const run: InternalWorkflowRun = {
      id: runId,
      workflowId,
      tenantId,
      status: 'running',
      input,
      startedAt: now,
      steps: [],
      definition,
      options: options ?? {},
    };

    this.runs.set(runId, run);
    this.running.add(runId);

    // Set timeout
    run.timeoutId = setTimeout(() => {
      if (run.status === 'running') {
        this.failRun(run, 'Workflow timeout');
      }
    }, timeout);

    await this.events.publish('workflow.started', {
      runId,
      workflowId,
      tenantId,
    });

    this.logger.info('Workflow started', { runId, workflowId, tenantId });

    // Execute steps
    try {
      let previousOutput: unknown = input;

      for (const stepDef of definition.steps) {
        if (run.status !== 'running') {break;}

        const stepRun = await this.executeStep(run, stepDef, previousOutput);
        run.steps.push(stepRun);

        if (stepRun.status === 'failed' && !stepDef.continueOnError) {
          throw new Error(`Step ${stepDef.id} failed: ${stepRun.error}`);
        }

        previousOutput = stepRun.output;
      }

      // Success
      if (run.timeoutId) {clearTimeout(run.timeoutId);}

      run.status = 'completed';
      run.output = previousOutput;
      run.completedAt = new Date();

      await this.events.publish('workflow.completed', {
        runId,
        workflowId,
        output: run.output,
      });

      this.logger.info('Workflow completed', { runId, workflowId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.failRun(run, errorMessage);

      // Handle retry policy
      if (options?.retryPolicy) {
        await this.scheduleRetry(run, options.retryPolicy);
      }
    } finally {
      this.running.delete(runId);

      // Release resource slot
      await this.resources.releaseSlot(slot);

      // Persist run to storage
      await this.persistRun(run);
    }

    return this.toPublicRun(run);
  }

  async getStatus(runId: string): Promise<WorkflowRun | null> {
    // Check memory first
    const run = this.runs.get(runId);
    if (run) {return this.toPublicRun(run);}

    // Try to load from storage
    const stored = await this.storage.read(`workflows/${runId}.json`);
    if (stored) {
      try {
        return JSON.parse(stored.toString()) as WorkflowRun;
      } catch {
        return null;
      }
    }

    return null;
  }

  async cancel(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Workflow run not found: ${runId}`);
    }

    if (run.status !== 'running' && run.status !== 'pending') {
      throw new Error(`Cannot cancel workflow in status: ${run.status}`);
    }

    if (run.timeoutId) {clearTimeout(run.timeoutId);}

    run.status = 'cancelled';
    run.completedAt = new Date();

    this.running.delete(runId);

    await this.events.publish('workflow.cancelled', {
      runId,
      workflowId: run.workflowId,
    });

    this.logger.info('Workflow cancelled', { runId });
  }

  async retry(runId: string, fromStep?: string): Promise<WorkflowRun> {
    const originalRun = this.runs.get(runId);
    if (!originalRun) {
      throw new Error(`Workflow run not found: ${runId}`);
    }

    // Find step to retry from
    let input = originalRun.input;
    const definition = originalRun.definition;

    if (fromStep) {
      const stepIndex = definition.steps.findIndex((s) => s.id === fromStep);
      if (stepIndex === -1) {
        throw new Error(`Step not found: ${fromStep}`);
      }

      // Use previous step's output as input
      if (stepIndex > 0 && originalRun.steps[stepIndex - 1]) {
        input = originalRun.steps[stepIndex - 1]!.output;
      }
    }

    this.logger.info('Retrying workflow', {
      originalRunId: runId,
      fromStep,
    });

    const tags: Record<string, string> = {
      ...originalRun.options.tags,
      retryOf: runId,
    };
    if (fromStep) {
      tags.retryFromStep = fromStep;
    }

    return this.execute(originalRun.workflowId, input, {
      ...originalRun.options,
      tags,
    });
  }

  async list(filter?: WorkflowFilter): Promise<WorkflowRun[]> {
    let results = Array.from(this.runs.values());

    if (filter?.workflowId) {
      results = results.filter((r) => r.workflowId === filter.workflowId);
    }
    if (filter?.tenantId) {
      results = results.filter((r) => r.tenantId === filter.tenantId);
    }
    if (filter?.status) {
      results = results.filter((r) => r.status === filter.status);
    }

    // Sort by start time (newest first)
    results.sort((a, b) => {
      const aTime = a.startedAt?.getTime() ?? 0;
      const bTime = b.startedAt?.getTime() ?? 0;
      return bTime - aTime;
    });

    // Apply pagination
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    results = results.slice(offset, offset + limit);

    return results.map((r) => this.toPublicRun(r));
  }

  /**
   * Execute a single workflow step.
   */
  private async executeStep(
    run: InternalWorkflowRun,
    stepDef: WorkflowStepDefinition,
    input: unknown
  ): Promise<WorkflowStepRun> {
    const stepRun: WorkflowStepRun = {
      id: stepDef.id,
      name: stepDef.name,
      status: 'running',
      input,
      startedAt: new Date(),
    };

    this.logger.debug('Executing step', {
      runId: run.id,
      stepId: stepDef.id,
    });

    try {
      const context: WorkflowStepContext = {
        workflowId: run.workflowId,
        runId: run.id,
        stepId: stepDef.id,
        tenantId: run.tenantId,
        previousStepOutput: input,
      };

      // Execute with optional step timeout
      const timeout = stepDef.timeout ?? 60000;
      const result = await Promise.race([
        stepDef.handler(input, context),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Step timeout')), timeout);
        }),
      ]);

      stepRun.status = 'completed';
      stepRun.output = result;
      stepRun.completedAt = new Date();

      this.logger.debug('Step completed', {
        runId: run.id,
        stepId: stepDef.id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      stepRun.status = 'failed';
      stepRun.error = errorMessage;
      stepRun.completedAt = new Date();

      this.logger.warn('Step failed', {
        runId: run.id,
        stepId: stepDef.id,
        error: errorMessage,
      });
    }

    return stepRun;
  }

  /**
   * Mark run as failed.
   */
  private failRun(run: InternalWorkflowRun, error: string): void {
    if (run.timeoutId) {clearTimeout(run.timeoutId);}

    run.status = 'failed';
    run.error = error;
    run.completedAt = new Date();

    this.events.publish('workflow.failed', {
      runId: run.id,
      workflowId: run.workflowId,
      error,
    });

    this.logger.error('Workflow failed', new Error(error), {
      runId: run.id,
      workflowId: run.workflowId,
    });
  }

  /**
   * Schedule a workflow retry based on policy.
   */
  private async scheduleRetry(
    run: InternalWorkflowRun,
    policy: RetryPolicy
  ): Promise<void> {
    const currentAttemptStr = run.options.tags?.['_retryAttempt'];
    const currentAttempt = currentAttemptStr ? parseInt(currentAttemptStr, 10) : 0;

    if (currentAttempt >= (policy.maxAttempts ?? 3)) {
      this.logger.warn('Max retry attempts reached', {
        runId: run.id,
        attempts: currentAttempt,
      });
      return;
    }

    // Calculate delay with exponential backoff
    const baseDelay = policy.initialDelay ?? 1000;
    const multiplier = policy.backoffMultiplier ?? 2;
    const delay = baseDelay * Math.pow(multiplier, currentAttempt);
    const maxDelay = policy.maxDelay ?? 60000;
    const actualDelay = Math.min(delay, maxDelay);

    this.logger.info('Scheduling workflow retry', {
      runId: run.id,
      attempt: currentAttempt + 1,
      delay: actualDelay,
    });

    setTimeout(async () => {
      try {
        await this.execute(run.workflowId, run.input, {
          ...run.options,
          tags: {
            ...run.options.tags,
            _retryAttempt: String(currentAttempt + 1),
            _retryOf: run.id,
          },
        });
      } catch (error) {
        this.logger.error('Retry execution failed', error as Error, {
          runId: run.id,
        });
      }
    }, actualDelay);
  }

  /**
   * Persist workflow run to storage.
   */
  private async persistRun(run: InternalWorkflowRun): Promise<void> {
    const publicRun = this.toPublicRun(run);
    const data = JSON.stringify(publicRun, null, 2);

    try {
      await this.storage.write(
        `workflows/${run.id}.json`,
        Buffer.from(data, 'utf-8')
      );
    } catch (error) {
      this.logger.warn('Failed to persist workflow run', {
        runId: run.id,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Convert internal run to public representation.
   */
  private toPublicRun(run: InternalWorkflowRun): WorkflowRun {
    return {
      id: run.id,
      workflowId: run.workflowId,
      tenantId: run.tenantId,
      status: run.status,
      input: run.input,
      output: run.output,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      steps: run.steps,
    };
  }

  /**
   * Stop all workflows (for cleanup).
   */
  dispose(): void {
    for (const run of this.runs.values()) {
      if (run.timeoutId) {
        clearTimeout(run.timeoutId);
      }
    }
  }

  /**
   * Get engine stats (for monitoring).
   */
  getStats(): {
    totalRuns: number;
    runningCount: number;
    registeredWorkflows: number;
    byStatus: Record<string, number>;
  } {
    const byStatus: Record<string, number> = {};

    for (const run of this.runs.values()) {
      byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    }

    return {
      totalRuns: this.runs.size,
      runningCount: this.running.size,
      registeredWorkflows: this.definitions.size,
      byStatus,
    };
  }
}
