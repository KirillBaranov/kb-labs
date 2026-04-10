/**
 * @module @kb-labs/core-runtime/run-orchestrator
 * Minimal run state machine orchestration skeleton.
 */

import { randomUUID } from 'node:crypto';
import type {
  CreateEnvironmentRequest,
  CreateRunRequest,
  RunRecord,
  RunStatus,
} from '@kb-labs/core-platform';
import type { RunStepExecutionRequest } from './run-executor.js';
import type { EnvironmentManager } from './environment-manager.js';
import type { RunExecutor } from './run-executor.js';

/**
 * Full-cycle start request (MVP skeleton).
 */
export interface StartFullCycleRequest {
  run: CreateRunRequest;
  environment: CreateEnvironmentRequest;
  firstStep?: RunStepExecutionRequest['execution'];
}

/**
 * In-memory orchestrator skeleton for phase 2 wiring.
 */
export class RunOrchestrator {
  private readonly runs = new Map<string, RunRecord>();

  constructor(
    private readonly environmentManager: EnvironmentManager,
    private readonly runExecutor: RunExecutor,
    private readonly logger: { debug(message: string, meta?: Record<string, unknown>): void }
  ) {}

  /**
   * Create run record in memory.
   */
  createRun(input: CreateRunRequest): RunRecord {
    const now = new Date().toISOString();
    const run: RunRecord = {
      runId: randomUUID(),
      status: 'queued',
      taskRef: input.taskRef,
      templateId: input.templateId,
      actorId: input.actorId,
      tenantId: input.tenantId,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(run.runId, run);
    return run;
  }

  /**
   * Read run from in-memory store.
   */
  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  /**
   * Start minimal full-cycle flow.
   * queue -> provisioning -> executing -> completed/failed
   */
  async startFullCycle(request: StartFullCycleRequest): Promise<RunRecord> {
    const run = this.createRun(request.run);
    this.transition(run.runId, 'provisioning');

    try {
      const environment = await this.environmentManager.createEnvironment({
        ...request.environment,
        runId: request.environment.runId ?? run.runId,
        tenantId: request.environment.tenantId ?? request.run.tenantId,
      });

      run.environmentId = environment.environmentId;
      this.transition(run.runId, 'executing');

      if (request.firstStep) {
        await this.runExecutor.executeStep({
          runId: run.runId,
          stepId: 'step-1',
          environmentId: environment.environmentId,
          execution: request.firstStep,
        });
      }

      this.transition(run.runId, 'completed');
      return this.getRunOrThrow(run.runId);
    } catch (error) {
      this.transition(run.runId, 'failed');
      this.logger.debug('RunOrchestrator: run failed', {
        runId: run.runId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (run.environmentId) {
        try {
          await this.environmentManager.destroyEnvironment(
            run.environmentId,
            'run.failed'
          );
        } catch {
          // Best-effort cleanup for skeleton implementation.
        }
      }

      throw error;
    }
  }

  private transition(runId: string, to: RunStatus): void {
    const run = this.getRunOrThrow(runId);
    const now = new Date().toISOString();
    const from = run.status;

    run.status = to;
    run.updatedAt = now;
    if (!run.startedAt && to !== 'queued') {
      run.startedAt = now;
    }
    if (to === 'completed' || to === 'failed' || to === 'failed_by_review' || to === 'cancelled') {
      run.completedAt = now;
    }

    this.logger.debug('RunOrchestrator: transition', {
      runId,
      from,
      to,
      updatedAt: now,
    });
  }

  private getRunOrThrow(runId: string): RunRecord {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    return run;
  }
}

