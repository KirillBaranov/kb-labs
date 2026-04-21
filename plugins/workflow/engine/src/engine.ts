import type {
  WorkflowRun,
  WorkflowSpec,
  JobRun,
} from '@kb-labs/workflow-contracts'
import {
  EVENT_NAMES,
  WORKFLOW_REDIS_CHANNEL,
  type WorkflowEventName,
} from '@kb-labs/workflow-constants'
import type { ICache, IEventBus, ILogger, IAnalytics, Unsubscribe } from '@kb-labs/core-platform'
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

interface SnapshotManagerClient {
  restoreSnapshot(request: {
    snapshotId: string
    workspaceId?: string
    environmentId?: string
    targetPath?: string
    overwrite?: boolean
    metadata?: Record<string, unknown>
  }): Promise<unknown>
}

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
  snapshotManager?: SnapshotManagerClient
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
  }

  /**
   * Mark job as failed and optionally schedule retry.
   * Implements exponential/linear backoff retry logic.
   */
  async markJobFailed(
    runId: string,
    jobId: string,
    error: Error,
    shouldRetry = true
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

    // Track job failure
    this.analytics?.track('workflow.job.failed', {
      runId,
      jobId,
      jobName: job.jobName,
      attempt: (job.attempt || 0) + 1,
      errorMessage: error.message,
      willRetry: shouldRetry && this.shouldRetryJob(job),
    }).catch(() => {})

    await this.events.publish({
      type: EVENT_NAMES.job.failed,
      runId,
      jobId,
      payload: { jobName: job.jobName, error: error.message, attempt: (job.attempt || 0) + 1 },
    })

    // Check if should retry
    if (shouldRetry && this.shouldRetryJob(job)) {
      const backoffMs = this.calculateBackoff(job.attempt || 0, job.retries)

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
      // Move to Dead Letter Queue
      await this.moveToDLQ(runId, jobId, error)
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

    this.logger.debug('Job started', { runId, jobId })

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
      const released = await this.stateStore.releaseBlockedJobs(runId, job.jobName)
      for (const releasedJob of released) {
        await this.scheduler.enqueueJob(runId, releasedJob, releasedJob.priority ?? 'normal')
        this.logger.info('Unblocked dependent job', { runId, jobId: releasedJob.id, unlockedBy: job.jobName })
      }
    }

    // Check if all jobs in run are completed - update run status
    await this.checkRunCompletion(runId)
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
      await this.stateStore.updateRun(runId, (draft) => {
        draft.status = 'success'
        draft.finishedAt = new Date().toISOString()
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
    } else if (anyFailed) {
      await this.stateStore.updateRun(runId, (draft) => {
        draft.status = 'failed'
        draft.finishedAt = new Date().toISOString()
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
      draft.status = 'waiting_approval' as any
      draft.startedAt = draft.startedAt ?? new Date().toISOString()
    })

    await this.events.publish({
      type: EVENT_NAMES.step.waitingApproval as any,
      runId,
      payload: { jobId, stepId },
    })

    this.logger.info('Step waiting for approval', { runId, jobId, stepId })
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

    await Promise.all(
      runIds.map(async (runId) => {
        const run = await this.stateStore.getRun(runId)
        if (!run) { return }
        if (run.status !== 'running' && run.status !== 'queued') { return }

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
   * Determine if job should be retried based on retry policy.
   */
  private shouldRetryJob(job: JobRun): boolean {
    const retryPolicy = job.retries || { max: 3, backoff: 'exp' as const }
    const attempt = job.attempt || 0

    return attempt < retryPolicy.max
  }

  /**
   * Calculate backoff delay using exponential or linear strategy.
   */
  private calculateBackoff(
    attempt: number,
    policy?: { backoff: 'exp' | 'lin'; initialIntervalMs?: number; maxIntervalMs?: number }
  ): number {
    const config = {
      backoff: policy?.backoff || 'exp',
      initialIntervalMs: policy?.initialIntervalMs || 1000,
      maxIntervalMs: policy?.maxIntervalMs || 60000,
    }

    let backoffMs: number

    if (config.backoff === 'exp') {
      // Exponential: 1s, 2s, 4s, 8s, 16s, 32s...
      backoffMs = config.initialIntervalMs * Math.pow(2, attempt)
    } else {
      // Linear: 1s, 2s, 3s, 4s, 5s...
      backoffMs = config.initialIntervalMs * (attempt + 1)
    }

    // Cap at maxIntervalMs
    return Math.min(backoffMs, config.maxIntervalMs)
  }

  /**
   * Move permanently failed job to Dead Letter Queue.
   */
  private async moveToDLQ(runId: string, jobId: string, error: Error): Promise<void> {
    this.logger.warn('Job moved to DLQ after max retries', { runId, jobId })

    // Update run status to 'dlq'
    await this.stateStore.updateRun(runId, (draft) => {
      draft.status = 'dlq'
      draft.result = {
        status: 'dlq',
        summary: `Job ${jobId} failed after max retries`,
        error: {
          message: error.message,
          details: {
            stack: error.stack,
          },
        },
      }
      draft.finishedAt = new Date().toISOString()
    })

    // Store in cache with DLQ prefix
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

    // Publish event
    const updatedRun = await this.stateStore.getRun(runId)
    if (updatedRun) {
      await this.publishRunEvent(EVENT_NAMES.run.failed, updatedRun)
    }
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
    }

    return updated
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
  ): Promise<void> {
    await this.events.publish({
      type: EVENT_NAMES.log.appended,
      runId,
      jobId,
      stepId,
      payload: entry,
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

    // If fromStepId is specified, mark all steps before it as completed
    if (options.fromStepId) {
      for (const job of restoredRun.jobs) {
        let foundStep = false
        for (const step of job.steps) {
          if (step.id === options.fromStepId) {
            // Found the step to start from
            foundStep = true
            // Reset this step and all following steps
            if (step.status !== 'queued') {
              step.status = 'queued'
              step.startedAt = undefined
              step.finishedAt = undefined
            }
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

    // Update run status
    restoredRun.status = 'running'
    restoredRun.startedAt = restoredRun.startedAt ?? new Date().toISOString()
    restoredRun.finishedAt = undefined

    // Save restored run
    await this.stateStore.saveRun(restoredRun)

    // Schedule the run
    await this.scheduler.scheduleRun(restoredRun)

    this.logger.info('Run replayed from snapshot', {
      runId,
      fromStepId: options.fromStepId,
    })

    return restoredRun
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




