import { randomUUID } from 'node:crypto'
import type {
  WorkflowRun,
  WorkflowSpec,
  JobRun,
  ExpressionContext,
} from '@kb-labs/workflow-contracts'
import { evaluateExpression, resolveExpression } from '@kb-labs/workflow-contracts'
import {
  EVENT_NAMES,
  WORKFLOW_REDIS_CHANNEL,
  type WorkflowEventName,
} from '@kb-labs/workflow-constants'
import type { ICache, IEventBus, ILogger, IAnalytics, ISnapshotManager, Unsubscribe } from '@kb-labs/core-platform'
import type { ClassifiedFailure, RetryPolicyConfig } from '@kb-labs/core-contracts'
import { classifyFailure, decideRetry } from '@kb-labs/core-retry'
import { StateStore } from './state-store'
import { ConcurrencyManager, type AcquireOptions } from './concurrency-manager'
import {
  RunCoordinator,
  type RunCoordinatorOptions,
} from './run-coordinator'
import {
  Scheduler,
  type SchedulerOptions,
  type JobQueueEntry,
} from './scheduler'
import { EventBusBridge, type WorkflowEvent } from './event-bus'
import { WorkflowLoader } from './workflow-loader'
import type { CreateRunInput, EngineLogger, RunContext } from './types'
import { RunSnapshotStorage, type RunSnapshot } from './run-snapshot'

export interface WorkflowEngineOptions {
  scheduler?: SchedulerOptions
  concurrency?: AcquireOptions
  runCoordinator?: RunCoordinatorOptions
  maxWorkflowDepth?: number
  /** Platform cache adapter (REQUIRED) */
  cache: ICache
  /** Platform event bus adapter (REQUIRED) */
  events: IEventBus
  /** Platform logger (REQUIRED) */
  logger: ILogger
  /** Platform analytics adapter (OPTIONAL) */
  analytics?: IAnalytics
  /** Platform snapshot manager (OPTIONAL - for infra snapshot restore in replay) */
  snapshotManager?: ISnapshotManager
  /** Workspace root (monorepo root) - used for plugin execution context */
  workspaceRoot?: string
}

export class WorkflowEngine {
  readonly loader: WorkflowLoader
  readonly maxWorkflowDepth: number

  private readonly logger: EngineLogger
  private readonly analytics?: IAnalytics
  private readonly stateStore: StateStore
  private readonly concurrency: ConcurrencyManager
  private readonly runCoordinator: RunCoordinator
  private readonly scheduler: Scheduler
  private readonly events: EventBusBridge
  private readonly snapshotStorage: RunSnapshotStorage

  constructor(private readonly options: WorkflowEngineOptions) {
    this.logger = options.logger
    this.analytics = options.analytics

    this.stateStore = new StateStore(options.cache, this.logger)
    this.concurrency = new ConcurrencyManager(
      options.cache,
      this.logger,
      options.concurrency,
    )
    this.runCoordinator = new RunCoordinator(
      options.cache,
      this.stateStore,
      this.concurrency,
      this.logger,
      options.runCoordinator,
    )

    this.scheduler = new Scheduler(options.cache, this.logger, options.scheduler)
    this.events = new EventBusBridge(options.events, this.logger)
    this.loader = new WorkflowLoader(this.logger)
    this.maxWorkflowDepth = options.maxWorkflowDepth ?? 2
    this.snapshotStorage = new RunSnapshotStorage(options.cache, this.logger)
  }

  async dispose(): Promise<void> {
    // Cleanup if needed
  }

  /**
   * Subscribe to real-time events for a specific workflow run.
   * Events are filtered by runId from the shared event bus channel.
   */
  subscribeToRunEvents(
    runId: string,
    handler: (event: WorkflowEvent) => void,
  ): Unsubscribe {
    return this.options.events.subscribe(WORKFLOW_REDIS_CHANNEL, async (raw: unknown) => {
      const event = raw as WorkflowEvent
      if (event.runId === runId) {handler(event)}
    })
  }

  async createRun(input: CreateRunInput): Promise<WorkflowRun> {
    const run = await this.runCoordinator.ensureRun(input)

    // Track workflow run creation
    this.analytics?.track('workflow.run.created', {
      runId: run.id,
      name: run.name,
      version: run.version,
      jobCount: run.jobs.length,
      trigger: input.trigger?.type,
    }).catch(() => {}) // Silent fail for analytics

    await this.events.publish({
      type: EVENT_NAMES.run.created,
      runId: run.id,
      payload: {
        status: run.status,
        name: run.name,
        version: run.version,
      },
    })
    await this.scheduler.scheduleRun(run)

    return run
  }

  async runFromSpec(
    spec: WorkflowSpec,
    input: Omit<CreateRunInput, 'spec'>,
  ): Promise<WorkflowRun> {
    return this.createRun({
      ...input,
      spec,
    })
  }

  async runFromFile(
    filePath: string,
    input: Omit<CreateRunInput, 'spec'>,
  ): Promise<WorkflowRun> {
    const result = await this.loader.fromFile(filePath)
    return this.runFromSpec(result.spec, input)
  }

  async runFromInline(
    spec: unknown,
    input: Omit<CreateRunInput, 'spec'>,
  ): Promise<WorkflowRun> {
    const result = this.loader.fromInline(spec)
    return this.runFromSpec(result.spec, input)
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    return this.stateStore.getRun(runId)
  }

  async cancelRun(runId: string): Promise<void> {
    const run = await this.getRun(runId)

    if (!run || ['success', 'failed', 'cancelled', 'skipped', 'dlq'].includes(run.status)) {
      return
    }

    await this.stateStore.updateRun(runId, (draft) => {
      draft.status = 'cancelled'
      draft.finishedAt = new Date().toISOString()
      return draft
    })

    // Track workflow cancellation
    this.analytics?.track('workflow.run.cancelled', {
      runId,
      name: run?.name,
      reason: 'cancelled by parent workflow',
    }).catch(() => {})

    await this.events.publish({
      type: EVENT_NAMES.run.cancelled,
      runId,
      payload: { reason: 'cancelled by parent workflow' },
    })

    // Invocation links are persisted on child trigger metadata, so cancellation
    // survives worker/daemon restarts and naturally cascades through descendants.
    const descendants = await this.findChildRuns(runId)
    await Promise.all(descendants.map((child) => this.cancelRun(child.id)))
    await this.reconcileChildInvocation(runId)
  }

  /**
   * Reconcile all persisted parent/child links. This is deliberately engine-side
   * instead of a worker-local polling task: it is safe to call after a daemon
   * restart and is idempotent when several reconciliations race.
   */
  async reconcileChildInvocations(): Promise<number> {
    const runs = await this.listStoredRuns()
    let reconciled = 0

    for (const parent of runs) {
      for (const job of parent.jobs) {
        for (const step of job.steps) {
          if (step.status !== 'waiting_child') {continue}
          const childRunId = step.metadata?.['childRunId']
          if (typeof childRunId !== 'string') {continue}

          const child = await this.getRun(childRunId)
          if (parent.status === 'cancelled') {
            if (child) {await this.cancelRun(child.id)}
            continue
          }
          if (!child) {
            await this.failChildInvocation(parent.id, job.id, step.id, childRunId, 'not found')
            reconciled++
            continue
          }
          if (!['success', 'failed', 'cancelled', 'skipped', 'dlq'].includes(child.status)) {
            continue
          }
          if (child.status === 'success') {
            const outputs = this.childResultEnvelope(child)
            await this.markStepCompleted(parent.id, job.id, step.id, outputs)
            await this.resumeJob(parent.id, job.id)
          } else {
            await this.failChildInvocation(parent.id, job.id, step.id, child.id, child.status)
          }
          reconciled++
        }
      }
    }
    return reconciled
  }

  /** Run reconciliation on terminal-child events; startup calls it once too. */
  async reconcileChildInvocation(childRunId: string): Promise<number> {
    const parents = (await this.listStoredRuns()).filter((run) =>
      run.jobs.some((job) => job.steps.some((step) =>
        step.status === 'waiting_child' && step.metadata?.['childRunId'] === childRunId,
      )),
    )
    if (parents.length === 0) {return 0}
    return this.reconcileChildInvocations()
  }

  private childResultEnvelope(child: WorkflowRun): Record<string, unknown> {
    const stepOutputs: Record<string, Record<string, unknown>> = {}
    for (const job of child.jobs) {
      for (const step of job.steps) {
        if (step.status === 'success' && step.spec.id && step.outputs) {
          stepOutputs[step.spec.id] = step.outputs
        }
      }
    }
    return {
      runId: child.id,
      status: child.status,
      outputs: Object.keys(child.result?.outputs ?? {}).length > 0
        ? child.result?.outputs
        : stepOutputs,
      artifacts: child.artifacts ?? [],
    }
  }

  private resolveDeclaredOutputs(run: WorkflowRun): Record<string, unknown> {
    const declarations = run.metadata?.outputDeclarations
    if (!declarations) {return {}}
    const context = this.buildExpressionContext(run)
    return Object.fromEntries(Object.entries(declarations).map(([name, declaration]) => {
      const source = declaration && typeof declaration === 'object'
        ? (declaration as { source?: unknown }).source
        : undefined
      return [name, typeof source === 'string' ? resolveExpression(source, context) : undefined]
    }))
  }

  private async failChildInvocation(
    parentRunId: string,
    parentJobId: string,
    parentStepId: string,
    childRunId: string,
    childStatus: string,
  ): Promise<void> {
    const error = new Error(`Child workflow ${childStatus} (run ${childRunId})`)
    await this.markStepFailed(parentRunId, parentJobId, parentStepId, error, {
      runId: childRunId,
      status: childStatus,
    })
    await this.markJobFailed(parentRunId, parentJobId, error, undefined, false)
  }

  private async listStoredRuns(): Promise<WorkflowRun[]> {
    const runIds = await this.stateStore.getAllRunIds()
    // Cache sorted-set adapters are permitted to retain duplicate members on
    // repeated saveRun calls. Reconciliation must be exactly-once per durable
    // run record even when event/index delivery is at-least-once.
    const runs = await Promise.all([...new Set(runIds)].map((id) => this.getRun(id)))
    return runs.filter((run): run is WorkflowRun => run !== null)
  }

  private async findChildRuns(parentRunId: string): Promise<WorkflowRun[]> {
    return (await this.listStoredRuns()).filter((run) =>
      run.trigger.parentRunId === parentRunId || run.metadata?.parentRunId === parentRunId,
    )
  }

  /**
   * Mark job as failed and optionally schedule retry.
   * Implements exponential/linear backoff retry logic.
   */
  async markJobFailed(
    runId: string,
    jobId: string,
    error: Error,
    failure?: ClassifiedFailure,
    policyOverride?: false | { max: number; backoff?: 'exp' | 'lin'; initialIntervalMs?: number; maxIntervalMs?: number; on?: string[] }
  ): Promise<void> {
    const run = await this.stateStore.getRun(runId)
    if (!run) {
      this.logger.warn('Cannot mark job as failed: run not found', { runId, jobId })
      return
    }

    const job = run.jobs.find((j) => j.id === jobId)
    if (!job) {
      this.logger.warn('Cannot mark job as failed: job not found', { runId, jobId })
      return
    }

    // Update job status to failed
    await this.stateStore.updateJob(runId, jobId, (draft) => {
      draft.status = 'failed'
      draft.error = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      }
      draft.finishedAt = new Date().toISOString()
      draft.attempt = (draft.attempt || 0) + 1
    })

    this.logger.error('Job failed', error, {
      runId,
      jobId,
      attempt: (job.attempt || 0) + 1,
    })

    const classified = failure ?? classifyFailure(error, { source: 'execution', phase: 'response' })
    const retryConfig: RetryPolicyConfig | undefined = policyOverride !== undefined && typeof policyOverride !== 'boolean'
      ? {
          maxAttempts: policyOverride.max + 1,
          retryOn: (policyOverride.on ?? ['command', 'network', 'timeout', 'rate_limit', 'server', 'infrastructure']) as RetryPolicyConfig['retryOn'],
          initialDelayMs: policyOverride.initialIntervalMs ?? 1000,
          backoff: policyOverride.backoff === 'lin' ? 'linear' : 'exponential',
          maxDelayMs: policyOverride.maxIntervalMs ?? 30_000,
          respectRetryAfter: true,
          requireIdempotencyForUnsafeFailures: true,
        }
      : undefined
    const retryDecision = policyOverride === false
      ? { retry: false, reason: 'policy_denied' as const, delayMs: 0 }
      : retryConfig
      ? decideRetry({ failure: classified, attempt: job.attempt || 0, policy: retryConfig })
      : decideRetry({ failure: classified, attempt: job.attempt || 0 })

    // Track job failure
    this.analytics?.track('workflow.job.failed', {
      runId,
      jobId,
      jobName: job.jobName,
      attempt: (job.attempt || 0) + 1,
      errorMessage: error.message,
      willRetry: retryDecision.retry,
      failureKind: classified.kind,
      failureCode: classified.code,
    }).catch(() => {})

    await this.events.publish({
      type: EVENT_NAMES.job.failed,
      runId,
      jobId,
      payload: { jobName: job.jobName, error: error.message, attempt: (job.attempt || 0) + 1 },
    })

    // Check if should retry
    if (retryDecision.retry) {
      const backoffMs = retryDecision.delayMs

      this.logger.info('Scheduling job retry', {
        runId,
        jobId,
        attempt: (job.attempt || 0) + 1,
        backoffMs,
      })

      // Re-queue job after backoff
      setTimeout(async () => {
        await this.stateStore.updateJob(runId, jobId, (draft) => {
          draft.status = 'queued'
          draft.error = undefined
          draft.startedAt = undefined
          draft.finishedAt = undefined
        })

        // Re-enqueue in scheduler
        const updatedRun = await this.stateStore.getRun(runId)
        const updatedJob = updatedRun?.jobs.find((j) => j.id === jobId)
        if (updatedJob) {
          await this.scheduler.enqueueJob(runId, updatedJob, updatedJob.priority ?? 'normal')
        }

        this.logger.info('Job re-queued for retry', { runId, jobId })
      }, backoffMs)
    } else {
      // Terminal failure: no retries left.
      // 1. Dead-letter the job for observability (cache record, no status change).
      // 2. Cancel downstream jobs that depend on this one so they don't hang in
      //    'queued' forever (B-030).
      // 3. Let checkRunCompletion finalize the run as 'failed' — 'dlq' is reserved
      //    for infrastructure failures and must not leak as a user-step outcome (B-029).
      await this.deadLetterJob(runId, jobId, error)
      await this.cancelDownstreamJobs(runId, job.jobName, `upstream job "${job.jobName}" failed`)
      await this.checkRunCompletion(runId)
    }
  }

  /**
   * Recursively cancel jobs blocked on a failed/cancelled upstream job, so the
   * DAG does not leave dependents stuck in 'queued'. Cancellation cascades:
   * a cancelled job also cancels its own dependents.
   */
  private async cancelDownstreamJobs(
    runId: string,
    failedJobName: string,
    reason: string,
  ): Promise<void> {
    const released = await this.stateStore.releaseBlockedJobs(runId, failedJobName)
    for (const downstreamJob of released) {
      const now = new Date().toISOString()
      await this.stateStore.updateJob(runId, downstreamJob.id, (draft) => {
        draft.status = 'cancelled'
        draft.blocked = false
        draft.finishedAt = now
        draft.error = { message: reason, timestamp: now }
      })
      await this.events.publish({
        type: EVENT_NAMES.job.cancelled,
        runId,
        jobId: downstreamJob.id,
        payload: { jobName: downstreamJob.jobName, reason },
      })
      this.logger.info('Cancelled dependent job after upstream failure', {
        runId,
        jobId: downstreamJob.id,
        unlockedBy: failedJobName,
      })
      // Cascade: this job's own dependents must also be cancelled.
      await this.cancelDownstreamJobs(runId, downstreamJob.jobName, reason)
    }
  }

  /**
   * Mark job as interrupted (e.g., during graceful shutdown).
   * Interrupted jobs will be retried on next daemon startup.
   */
  async markJobInterrupted(runId: string, jobId: string): Promise<void> {
    await this.stateStore.updateJob(runId, jobId, (draft) => {
      draft.status = 'interrupted'
      draft.finishedAt = new Date().toISOString()
    })

    this.logger.warn('Job interrupted', { runId, jobId })
  }

  /**
   * Mark job as started (running).
   */
  async markJobStarted(runId: string, jobId: string): Promise<void> {
    await this.stateStore.updateJob(runId, jobId, (draft) => {
      draft.status = 'running'
      draft.startedAt = new Date().toISOString()
    })

    // Promote run status to 'running' when first job starts
    await this.stateStore.updateRun(runId, (draft) => {
      if (draft.status === 'queued') {
        draft.status = 'running'
        if (!draft.startedAt) {
          draft.startedAt = new Date().toISOString()
        }
      }
    })

    this.logger.info('Job started', { runId, jobId })

    // Track job start
    const run = await this.getRun(runId)
    const job = run?.jobs.find((j) => j.id === jobId)
    this.analytics?.track('workflow.job.started', {
      runId,
      jobId,
      jobName: job?.jobName,
      stepCount: job?.steps.length ?? 0,
    }).catch(() => {})

    await this.events.publish({
      type: EVENT_NAMES.job.started,
      runId,
      jobId,
      payload: { jobName: job?.jobName },
    })
  }

  /**
   * Mark job as completed successfully.
   */
  async markJobCompleted(runId: string, jobId: string): Promise<void> {
    const run = await this.getRun(runId)
    const job = run?.jobs.find((j) => j.id === jobId)
    const startTime = job?.startedAt ? new Date(job.startedAt).getTime() : Date.now()
    const duration = Date.now() - startTime

    await this.stateStore.updateJob(runId, jobId, (draft) => {
      draft.status = 'success'
      draft.finishedAt = new Date().toISOString()
    })

    this.logger.info('Job completed successfully', { runId, jobId })

    // Track job completion
    this.analytics?.track('workflow.job.completed', {
      runId,
      jobId,
      jobName: job?.jobName,
      durationMs: duration,
      stepCount: job?.steps.length ?? 0,
    }).catch(() => {})

    await this.events.publish({
      type: EVENT_NAMES.job.succeeded,
      runId,
      jobId,
      payload: { jobName: job?.jobName, durationMs: duration },
    })

    // Release jobs that were blocked waiting for this job to complete.
    if (job?.jobName) {
      const run = await this.stateStore.getRun(runId)
      const exprCtx = this.buildExpressionContext(run)
      const released = await this.stateStore.releaseBlockedJobs(runId, job.jobName)
      for (const releasedJob of released) {
        if (releasedJob.if && !this.evaluateJobIf(releasedJob.if, exprCtx)) {
          await this.skipJob(runId, releasedJob)
        } else {
          await this.scheduler.enqueueJob(runId, releasedJob, releasedJob.priority ?? 'normal')
          this.logger.info('Unblocked dependent job', { runId, jobId: releasedJob.id, unlockedBy: job.jobName })
        }
      }
    }

    // Check if all jobs in run are completed - update run status
    await this.checkRunCompletion(runId)
  }

  /** Build a minimal ExpressionContext from run state (for job-level if evaluation). */
  private buildExpressionContext(run: WorkflowRun | undefined | null): ExpressionContext {
    const ctx: ExpressionContext = {
      env: run?.env ?? {},
      trigger: run?.trigger ?? { type: 'manual' },
      inputs: run?.inputs ?? {},
      steps: {},
    }
    if (run) {
      for (const j of run.jobs) {
        for (const s of j.steps) {
          if (s.status === 'success' && s.spec.id) {
            ctx.steps[s.spec.id] = { outputs: (s.outputs ?? {}) as Record<string, unknown> }
          }
        }
      }
    }
    return ctx
  }

  /** Evaluate a job-level `if:` expression. Strips ${{ }} wrapper if present. */
  private evaluateJobIf(condition: string, ctx: ExpressionContext): boolean {
    const raw = condition.trim().replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '')
    return evaluateExpression(raw, ctx)
  }

  /** Mark a job as skipped (success) and release any jobs blocked on it. */
  private async skipJob(runId: string, job: JobRun): Promise<void> {
    const now = new Date().toISOString()
    await this.stateStore.updateJob(runId, job.id, (draft) => {
      draft.status = 'success'
      draft.startedAt = now
      draft.finishedAt = now
    })
    this.logger.info('Job skipped: if condition false', { runId, jobId: job.id, condition: job.if })
    // Release dependents of the skipped job (treat skip as success for DAG purposes)
    const downstream = await this.stateStore.releaseBlockedJobs(runId, job.jobName)
    const run = await this.stateStore.getRun(runId)
    const exprCtx = this.buildExpressionContext(run)
    for (const downstreamJob of downstream) {
      if (downstreamJob.if && !this.evaluateJobIf(downstreamJob.if, exprCtx)) {
        await this.skipJob(runId, downstreamJob)
      } else {
        await this.scheduler.enqueueJob(runId, downstreamJob, downstreamJob.priority ?? 'normal')
        this.logger.info('Unblocked dependent job', { runId, jobId: downstreamJob.id, unlockedBy: job.jobName })
      }
    }
  }

  /**
   * Check if all jobs in a run are completed and update run status accordingly.
   */
  private async checkRunCompletion(runId: string): Promise<void> {
    const run = await this.getRun(runId)
    if (!run) {
      return
    }

    // Check status of all jobs
    const allSuccess = run.jobs.every((j) => j.status === 'success')
    const anyFailed = run.jobs.some((j) => j.status === 'failed')
    const anyRunning = run.jobs.some((j) => j.status === 'running' || j.status === 'queued')

    // If any job is still running/queued, run is not complete
    if (anyRunning) {
      return
    }

    // Update run status based on job outcomes
    if (allSuccess) {
      const updated = await this.stateStore.updateRun(runId, (draft) => {
        draft.status = 'success'
        draft.finishedAt = new Date().toISOString()
        draft.result = {
          ...(draft.result ?? { status: 'success' }),
          status: 'success',
          outputs: this.resolveDeclaredOutputs(draft),
        }
        return draft
      })
      this.logger.info('Workflow run completed successfully', { runId })

      // Track workflow completion
      this.analytics?.track('workflow.run.completed', {
        runId,
        name: run.name,
        jobCount: run.jobs.length,
        status: 'success',
      }).catch(() => {})

      await this.events.publish({
        type: EVENT_NAMES.run.finished,
        runId,
        payload: { status: 'success', name: run.name },
      })

      if (updated) {
        await this.snapshotTerminalRun(updated)
      }
      await this.reconcileChildInvocation(runId)
    } else if (anyFailed) {
      // Surface the failing job's error at the run level so consumers (REST
      // /runs/:id, Studio, e2e) can show *why* the run failed without digging
      // into per-job records.
      const failedJob = run.jobs.find((j) => j.status === 'failed')
      const updated = await this.stateStore.updateRun(runId, (draft) => {
        draft.status = 'failed'
        draft.finishedAt = new Date().toISOString()
        if (failedJob?.error) {
          draft.result = {
            status: 'failed',
            summary: `Job ${failedJob.jobName} failed`,
            error: {
              message: failedJob.error.message,
              details: failedJob.error.stack ? { stack: failedJob.error.stack } : undefined,
            },
          }
        }
        return draft
      })
      this.logger.info('Workflow run failed', { runId })

      // Track workflow failure
      this.analytics?.track('workflow.run.completed', {
        runId,
        name: run.name,
        jobCount: run.jobs.length,
        status: 'failed',
      }).catch(() => {})

      await this.events.publish({
        type: EVENT_NAMES.run.failed,
        runId,
        payload: { status: 'failed', name: run.name },
      })

      if (updated) {
        await this.snapshotTerminalRun(updated)
      }
      await this.reconcileChildInvocation(runId)
    }
  }

  /**
   * Mark step as started (running).
   */
  async markStepStarted(runId: string, jobId: string, stepId: string): Promise<void> {
    await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
      draft.status = 'running'
      draft.startedAt = new Date().toISOString()
    })

    this.logger.debug('Step started', { runId, jobId, stepId })

    await this.events.publish({
      type: EVENT_NAMES.step.started,
      runId,
      jobId,
      stepId,
    })
  }

  /**
   * Mark step as completed successfully with output.
   */
  async markStepCompleted(
    runId: string,
    jobId: string,
    stepId: string,
    output?: unknown,
  ): Promise<void> {
    await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
      draft.status = 'success'
      draft.finishedAt = new Date().toISOString()
      if (output !== undefined) {
        draft.outputs = output as Record<string, unknown>
      }
    })

    this.logger.debug('Step completed', { runId, jobId, stepId })

    await this.events.publish({
      type: EVENT_NAMES.step.succeeded,
      runId,
      jobId,
      stepId,
      payload: output !== undefined ? { outputs: output } : undefined,
    })
  }

  /**
   * Mark step as failed with error.
   */
  async markStepFailed(
    runId: string,
    jobId: string,
    stepId: string,
    error: Error,
    outputs?: Record<string, unknown>,
  ): Promise<void> {
    await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
      draft.status = 'failed'
      draft.finishedAt = new Date().toISOString()
      draft.error = {
        message: error.message,
        stack: error.stack,
      }
      if (outputs) {draft.outputs = outputs}
    })

    this.logger.debug('Step failed', { runId, jobId, stepId, error: error.message })

    await this.events.publish({
      type: EVENT_NAMES.step.failed,
      runId,
      jobId,
      stepId,
      payload: { error: error.message },
    })
  }

  /**
   * Mark step as waiting for human approval.
   */
  async markStepWaitingApproval(
    runId: string,
    jobId: string,
    stepId: string,
  ): Promise<void> {
    await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
      draft.status = 'waiting_approval'
      draft.startedAt = draft.startedAt ?? new Date().toISOString()
    })

    await this.events.publish({
      type: EVENT_NAMES.step.waitingApproval,
      runId,
      payload: { jobId, stepId },
    })

    this.logger.info('Step waiting for approval', { runId, jobId, stepId })
  }

  /**
   * Park a step while its child workflow runs. The worker returns after this
   * transition, so parent workflows never consume the pool needed by children.
   */
  async markStepWaitingChild(
    runId: string,
    jobId: string,
    stepId: string,
    childRunId: string,
  ): Promise<void> {
    await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
      draft.status = 'waiting_child'
      draft.startedAt ??= new Date().toISOString()
      draft.metadata = { ...(draft.metadata ?? {}), childRunId }
    })

    await this.events.publish({
      type: EVENT_NAMES.step.waitingChild,
      runId,
      jobId,
      stepId,
      payload: { childRunId },
    })
  }

  /** Re-queue a parked parent job after its child workflow reaches a terminal state. */
  async resumeJob(runId: string, jobId: string): Promise<void> {
    const job = await this.stateStore.updateJob(runId, jobId, (draft) => {
      draft.status = 'queued'
      draft.finishedAt = undefined
    })
    if (job) {
      await this.scheduler.enqueueJob(runId, job, job.priority ?? 'normal')
    }
  }

  /**
   * Resolve a pending approval — approve or reject.
   * On approve: marks step as success with approval outputs.
   * On reject: marks step as failed with rejection error.
   */
  async resolveApproval(
    runId: string,
    jobId: string,
    stepId: string,
    action: 'approve' | 'reject',
    data?: Record<string, unknown>,
    comment?: string,
  ): Promise<void> {
    if (action === 'approve') {
      await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
        draft.status = 'success'
        draft.finishedAt = new Date().toISOString()
        draft.outputs = {
          approved: true,
          action,
          ...(comment ? { comment } : {}),
          ...(data ?? {}),
        }
      })

      this.logger.info('Approval granted', { runId, jobId, stepId, comment })
    } else {
      await this.stateStore.updateStep(runId, jobId, stepId, (draft) => {
        draft.status = 'failed'
        draft.finishedAt = new Date().toISOString()
        draft.error = {
          message: comment || 'Approval rejected',
          code: 'APPROVAL_REJECTED',
        }
        draft.outputs = {
          approved: false,
          action,
          ...(comment ? { comment } : {}),
          ...(data ?? {}),
        }
      })

      this.logger.info('Approval rejected', { runId, jobId, stepId, comment })
    }

    await this.events.publish({
      type: EVENT_NAMES.step.updated,
      runId,
      payload: { jobId, stepId, action },
    })
  }

  /**
   * Get the state store for direct access (used by worker for gate restart-from).
   */
  getStateStore(): StateStore {
    return this.stateStore
  }

  /**
   * Get the scheduler for direct access (used by worker for gate re-enqueue).
   */
  getScheduler(): Scheduler {
    return this.scheduler
  }

  /**
   * Mark stale running/queued runs as failed on daemon startup.
   * Runs that were in-flight when the daemon crashed are unrecoverable —
   * their executor process is gone, so we mark them failed immediately.
   */
  async cleanupStaleRuns(): Promise<void> {
    const runIds = await this.stateStore.getAllRunIds()
    const now = new Date().toISOString()
    let count = 0
    const runs = await this.listStoredRuns()
    const protectedChildRunIds = new Set(
      runs.flatMap((run) => run.jobs.flatMap((job) => job.steps
        .filter((step) => step.status === 'waiting_child')
        .map((step) => step.metadata?.['childRunId'])
        .filter((id): id is string => typeof id === 'string'))),
    )

    await Promise.all(
      runIds.map(async (runId) => {
        const run = await this.stateStore.getRun(runId)
        if (!run) { return }
        if (run.status !== 'running' && run.status !== 'queued') { return }
        // A parked parent and its child are durable orchestration state, not a
        // lost executor. Keep queued children intact; running children are
        // turned into resumable interruptions below.
        if (run.jobs.some((job) => job.steps.some((step) => step.status === 'waiting_child'))) {
          return
        }
        if (protectedChildRunIds.has(run.id)) {
          const hasRunningJob = run.jobs.some((job) => job.status === 'running')
          if (hasRunningJob) {
            await this.stateStore.updateRun(runId, (draft) => {
              for (const job of draft.jobs) {
                if (job.status === 'running') {
                  job.status = 'interrupted'
                  job.finishedAt = now
                  for (const step of job.steps) {
                    if (step.status === 'running') {
                      step.status = 'queued'
                      step.startedAt = undefined
                      step.finishedAt = undefined
                    }
                  }
                }
              }
            })
          }
          return
        }

        await this.stateStore.updateRun(runId, (draft) => {
          draft.status = 'failed'
          draft.finishedAt = now
          if (draft.startedAt) {
            draft.durationMs = new Date(now).getTime() - new Date(draft.startedAt).getTime()
          }
          // Mark any still-active jobs as failed too
          for (const job of draft.jobs) {
            if (job.status === 'running' || job.status === 'queued') {
              job.status = 'failed'
              job.error = { message: 'Daemon restarted — run was abandoned' }
              job.finishedAt = now
            }
          }
          return draft
        })
        count++
      }),
    )

    if (count > 0) {
      this.logger.warn('Cleaned up stale runs from previous daemon process', { count })
    }
  }

  /**
   * Resume interrupted jobs on daemon startup.
   * Re-queues jobs that were interrupted during previous shutdown.
   */
  async resumeInterruptedJobs(): Promise<void> {
    const runIds = await this.stateStore.getAllRunIds()

    // Process all runs in parallel
    const results = await Promise.all(
      runIds.map(async runId => {
        const run = await this.stateStore.getRun(runId)
        if (!run) {return 0}

        const interruptedJobs = run.jobs.filter(job => job.status === 'interrupted')

        // Process all interrupted jobs in this run in parallel
        await Promise.all(
          interruptedJobs.map(async job => {
            this.logger.info('Resuming interrupted job', { runId, jobId: job.id })

            await this.stateStore.updateJob(runId, job.id, (draft) => {
              draft.status = 'queued'
              draft.startedAt = undefined
              draft.finishedAt = undefined
            })

            // Re-enqueue in scheduler
            const queuedJob = { ...job, status: 'queued' as const }
            await this.scheduler.enqueueJob(runId, queuedJob, queuedJob.priority ?? 'normal')
          }),
        )

        return interruptedJobs.length
      }),
    )

    const resumedCount = results.reduce((sum, count) => sum + count, 0)

    if (resumedCount > 0) {
      this.logger.info('Resumed interrupted jobs', { count: resumedCount })
    }
  }

  /**
   * Move permanently failed job to Dead Letter Queue.
   */
  /**
   * Record a dead-letter entry for a job that exhausted its retries. This is an
   * observability artifact only — it does NOT change the run status. The run
   * outcome is decided by checkRunCompletion (→ 'failed'). 'dlq' as a run status
   * is reserved for infrastructure failures and is no longer set here (B-029).
   */
  private async deadLetterJob(runId: string, jobId: string, error: Error): Promise<void> {
    this.logger.warn('Job dead-lettered after max retries', { runId, jobId })

    const dlqKey = `workflow:dlq:${runId}:${jobId}`
    const run = await this.stateStore.getRun(runId)
    const job = run?.jobs.find((j) => j.id === jobId)

    await this.options.cache!.set(
      dlqKey,
      JSON.stringify({
        runId,
        jobId,
        jobName: job?.jobName,
        error: {
          message: error.message,
          stack: error.stack,
        },
        timestamp: new Date().toISOString(),
        attempts: job?.attempt || 0,
      }),
      7 * 24 * 60 * 60 * 1000 // TTL 7 days
    )
  }

  async updateRun(
    runId: string,
    mutator: (run: WorkflowRun) => WorkflowRun | void,
  ): Promise<WorkflowRun | null> {
    const updated = await this.stateStore.updateRun(runId, mutator)
    if (updated) {
      await this.publishRunEvent(EVENT_NAMES.run.updated, updated)
    }
    return updated
  }

  async finalizeRun(
    runId: string,
    status: WorkflowRun['status'],
    context: Partial<RunContext> = {},
  ): Promise<WorkflowRun | null> {
    const updated = await this.stateStore.updateRun(runId, (run) => {
      const now = new Date().toISOString()
      run.status = status
      run.finishedAt = now
      run.durationMs = computeDurationMs(run.startedAt ?? run.queuedAt, now)
      if (context.jobs) {
        run.jobs = context.jobs
      }
      if (context.steps) {
        // optional override steps already included in jobs
      }
      return run
    })

    if (updated) {
      await this.runCoordinator.releaseConcurrency(updated)
      await this.publishRunEvent(
        status === 'failed'
          ? EVENT_NAMES.run.failed
          : status === 'cancelled'
            ? EVENT_NAMES.run.cancelled
            : EVENT_NAMES.run.finished,
        updated,
      )

      await this.snapshotTerminalRun(updated)
    }

    return updated
  }

  /**
   * Persist a snapshot for a run that just reached a terminal state, so it
   * can be replayed from any step later (`replayRun`, used by both
   * `workflow runs restart --from-step` and `rerun --failed-only`). Only
   * 'success'/'failed' carry meaningful step output data worth snapshotting.
   *
   * Shared by finalizeRun() and checkRunCompletion() — checkRunCompletion is
   * the run-completion path actually driven by the worker in production, so
   * without this call here, no snapshot is ever created outside of tests
   * that call finalizeRun() directly (issue #263).
   */
  private async snapshotTerminalRun(run: WorkflowRun): Promise<void> {
    if (run.status !== 'success' && run.status !== 'failed') {
      return
    }

    const stepOutputs: Record<string, Record<string, unknown>> = {}
    for (const job of run.jobs) {
      for (const step of job.steps) {
        if (step.outputs && Object.keys(step.outputs).length > 0) {
          stepOutputs[step.id] = step.outputs
        }
      }
    }

    // Logged at error (not warn) because this silently disables
    // `workflow runs restart --from-step` and `rerun --failed-only` for
    // this run — replayRun() will report a generic "no snapshot" with no
    // other trace of why.
    await this.snapshotStorage.createSnapshot(run, stepOutputs, run.env ?? {}).catch((err) => {
      this.logger.error(
        'Failed to create run snapshot — restart --from-step and rerun --failed-only will not work for this run',
        err instanceof Error ? err : new Error(String(err)),
        { runId: run.id, status: run.status },
      )
    })
  }

  async nextJob(): Promise<JobQueueEntry | null> {
    return this.scheduler.dequeueJob()
  }

  async rescheduleJob(entry: JobQueueEntry, delayMs: number): Promise<void> {
    await this.scheduler.reschedule(entry, delayMs)
  }

  async publishRunEvent(
    type: WorkflowEventName,
    run: WorkflowRun,
  ): Promise<void> {
    await this.events.publish({
      type,
      runId: run.id,
      payload: {
        status: run.status,
        name: run.name,
        version: run.version,
      },
    })
  }

  /**
   * Publish a log entry for real-time streaming to Studio UI.
   */
  async publishLog(
    runId: string,
    jobId: string,
    stepId: string,
    entry: { level: string; message: string; stream: string; lineNo: number; timestamp: string; meta?: Record<string, unknown> },
    stepName?: string,
  ): Promise<void> {
    await this.events.publish({
      type: EVENT_NAMES.log.appended,
      runId,
      jobId,
      stepId,
      payload: stepName ? { ...entry, stepName } : entry,
    })
  }

  /**
   * Create a snapshot of the current run state
   */
  async createSnapshot(
    runId: string,
    stepOutputs: Record<string, Record<string, unknown>>,
    env: Record<string, string>,
    refs?: RunSnapshot['refs'],
  ): Promise<RunSnapshot | null> {
    const run = await this.getRun(runId)
    if (!run) {
      this.logger.warn('Cannot create snapshot: run not found', { runId })
      return null
    }

    return this.snapshotStorage.createSnapshot(run, stepOutputs, env, refs)
  }

  /**
   * Get a snapshot for a run
   */
  async getSnapshot(runId: string): Promise<RunSnapshot | null> {
    return this.snapshotStorage.getSnapshot(runId)
  }

  /**
   * Replay a run from a snapshot, optionally starting from a specific step
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Replay orchestration: handles snapshot loading, step state transitions (before/at/after fromStep), env merging, job traversal, and conditional status reset logic
  async replayRun(
    runId: string,
    options: {
      fromStepId?: string
      stepOutputs?: Record<string, Record<string, unknown>>
      env?: Record<string, string>
    } = {},
  ): Promise<WorkflowRun | null> {
    // Load snapshot
    const snapshot = await this.snapshotStorage.getSnapshot(runId)
    if (!snapshot) {
      this.logger.warn('Cannot replay: snapshot not found', { runId })
      return null
    }

    if (snapshot.refs?.workspaceSnapshotId || snapshot.refs?.environmentSnapshotId) {
      if (!this.options.snapshotManager) {
        throw new Error('SnapshotManager is required for replay with infra snapshot references')
      }

      if (snapshot.refs.workspaceSnapshotId) {
        await this.options.snapshotManager.restoreSnapshot({
          snapshotId: snapshot.refs.workspaceSnapshotId,
          metadata: { source: 'workflow.replay', runId },
        })
      }

      if (snapshot.refs.environmentSnapshotId) {
        await this.options.snapshotManager.restoreSnapshot({
          snapshotId: snapshot.refs.environmentSnapshotId,
          metadata: { source: 'workflow.replay', runId },
        })
      }
    }

    // Restore run state
    const restoredRun = snapshot.run

    // Restore env if provided
    if (options.env) {
      restoredRun.env = { ...snapshot.env, ...options.env }
    } else {
      restoredRun.env = snapshot.env
    }

    // Validate fromStepId before any state mutation — a non-existent ID must be
    // a hard error (404), not a silent success that saves a broken run state.
    if (options.fromStepId) {
      const stepExists = restoredRun.jobs.some(job =>
        job.steps.some(s => s.id === options.fromStepId),
      )
      if (!stepExists) {
        throw new Error(`Step not found: ${options.fromStepId}`)
      }
    }

    // If fromStepId is specified, mark all steps before it as completed.
    // foundStep is declared outside the job loop so jobs after the job
    // containing fromStepId have all their steps correctly reset to queued.
    if (options.fromStepId) {
      let foundStep = false
      for (const job of restoredRun.jobs) {
        for (const step of job.steps) {
          if (step.id === options.fromStepId) {
            foundStep = true
            step.status = 'queued'
            step.startedAt = undefined
            step.finishedAt = undefined
            continue
          }
          if (!foundStep) {
            // Mark previous steps as completed
            if (step.status === 'running' || step.status === 'queued') {
              step.status = 'success'
              step.finishedAt = step.finishedAt ?? new Date().toISOString()
            }
          } else {
            // Reset steps after the target step
            step.status = 'queued'
            step.startedAt = undefined
            step.finishedAt = undefined
          }
        }
      }
    } else {
      // Reset all steps to queued
      for (const job of restoredRun.jobs) {
        for (const step of job.steps) {
          step.status = 'queued'
          step.startedAt = undefined
          step.finishedAt = undefined
        }
      }
    }

    // Reconstruct job.blocked and job.pendingDependencies based on the reset
    // step state. In a completed run all jobs have blocked=false, so without
    // this step scheduleRun would enqueue all jobs simultaneously, ignoring
    // declared dependency ordering (needs: [...]).
    const isJobComplete = (job: JobRun): boolean =>
      job.steps.every(s => s.status === 'success' || s.status === 'skipped')

    for (const job of restoredRun.jobs) {
      if (!job.needs || job.needs.length === 0) {
        job.blocked = false
        job.pendingDependencies = []
        continue
      }
      const pendingDeps = job.needs.filter(depName => {
        const depJob = restoredRun.jobs.find(j => j.jobName === depName)
        return depJob !== undefined && !isJobComplete(depJob)
      })
      job.pendingDependencies = pendingDeps
      job.blocked = pendingDeps.length > 0
    }

    // Create a new run ID so the original run's history is preserved.
    // Overwriting the same ID would destroy history and corrupt state if the
    // original run's worker is still live (race condition).
    const newRunId = randomUUID()
    const newNow = new Date().toISOString()
    const newRun: WorkflowRun = {
      ...restoredRun,
      id: newRunId,
      status: 'queued',
      createdAt: newNow,
      queuedAt: newNow,
      startedAt: undefined,
      finishedAt: undefined,
      durationMs: undefined,
      result: undefined,
    }

    // Save the new run (original run at its own ID is untouched)
    await this.stateStore.saveRun(newRun)

    // Schedule the new run
    await this.scheduler.scheduleRun(newRun)

    this.logger.info('Run replayed as new run from snapshot', {
      originalRunId: runId,
      newRunId,
      fromStepId: options.fromStepId,
    })

    return newRun
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(runId: string): Promise<void> {
    await this.snapshotStorage.deleteSnapshot(runId)
  }

  /**
   * Get all active workflow executions (running or queued).
   * Returns array of WorkflowRun objects with status 'running' or 'queued'.
   */
  async getActiveExecutions(): Promise<WorkflowRun[]> {
    // Get all run IDs from sorted set index
    const runIds = await this.stateStore.getAllRunIds()

    // Fetch all runs in parallel and filter for active ones
    const runs = await Promise.all(runIds.map(id => this.stateStore.getRun(id)))

    return runs.filter(
      (run): run is WorkflowRun =>
        run !== null && (run.status === 'running' || run.status === 'queued'),
    )
  }

  /**
   * Get all workflow runs (all statuses).
   * Returns array of all WorkflowRun objects ordered by creation time.
   */
  async getAllRuns(): Promise<WorkflowRun[]> {
    // Get all run IDs from sorted set index
    const runIds = await this.stateStore.getAllRunIds()

    // Fetch all runs in parallel and filter out nulls
    const runs = await Promise.all(runIds.map(id => this.stateStore.getRun(id)))

    return runs.filter((run): run is WorkflowRun => run !== null)
  }

  /**
   * List all workflow runs.
   * Returns array of all runs in the system.
   * Alias for getAllRuns() - maintained for backward compatibility.
   */
  async listRuns(): Promise<WorkflowRun[]> {
    return this.getAllRuns()
  }

  /**
   * Get workflow engine metrics.
   * Returns statistics about runs, jobs, and system health.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- Metrics aggregation: iterates all runs and jobs, counts by status (6 run statuses + 4 job statuses), handles nulls
  async getMetrics(): Promise<{
    runs: {
      total: number
      queued: number
      running: number
      completed: number
      failed: number
      cancelled: number
      dlq: number
    }
    jobs: {
      total: number
      queued: number
      running: number
      completed: number
      failed: number
    }
  }> {
    // Get all run IDs
    const runIds = await this.stateStore.getAllRunIds()

    const metrics = {
      runs: {
        total: 0,
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        dlq: 0,
      },
      jobs: {
        total: 0,
        queued: 0,
        running: 0,
        completed: 0,
        failed: 0,
      },
    }

    // Fetch all runs in parallel
    const runs = await Promise.all(runIds.map(id => this.stateStore.getRun(id)))

    // Aggregate metrics from all runs
    for (const run of runs) {
      if (!run) {continue}

      metrics.runs.total++

      // Count run status
      if (run.status === 'queued') {metrics.runs.queued++}
      else if (run.status === 'running') {metrics.runs.running++}
      else if (run.status === 'success') {metrics.runs.completed++}
      else if (run.status === 'failed') {metrics.runs.failed++}
      else if (run.status === 'cancelled') {metrics.runs.cancelled++}
      else if (run.status === 'dlq') {metrics.runs.dlq++}

      // Count job statuses
      for (const job of run.jobs) {
        metrics.jobs.total++
        if (job.status === 'queued') {metrics.jobs.queued++}
        else if (job.status === 'running') {metrics.jobs.running++}
        else if (job.status === 'success') {metrics.jobs.completed++}
        else if (job.status === 'failed') {metrics.jobs.failed++}
      }
    }

    return metrics
  }
}

function computeDurationMs(
  startedAt: string | undefined,
  finishedAt: string,
): number | undefined {
  if (!startedAt) {
    return undefined
  }
  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return undefined
  }
  return Math.max(0, end - start)
}
