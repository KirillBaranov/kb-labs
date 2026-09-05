import type { JobRun, StepRun, WorkflowRun } from '@kb-labs/workflow-contracts'
import type { ICache } from '@kb-labs/core-platform'
import {
  assertTransition,
  type AssertTransitionOptions,
} from '@kb-labs/workflow-constants'
import type { EngineLogger } from './types'
import { withLock } from './lock'

/**
 * Run records must outlive individual workflow steps. Some steps (e.g. release
 * checks packing + clean-installing every package) run for tens of minutes
 * with no intermediate persistence call. Cache backends default `set()` TTL
 * to a few minutes (e.g. InMemoryStateBroker: 300_000ms) for ordinary ephemeral
 * caching — without an explicit override here, a long-running step's record
 * silently expires mid-flight, `getRun`/`updateRun` start returning null, and
 * the step's real result is never persisted (surfaces as a bogus "Daemon
 * restarted — run was abandoned" once something else touches the run).
 */
const RUN_TTL_MS = 24 * 60 * 60 * 1000 // 24h

/**
 * How long a daemon's liveness claim on this shared state store stays valid
 * without a heartbeat renewal. This answers a completely different question
 * from `RUN_TTL_MS` above: not "is this run's data still around" but "is the
 * daemon that owns it still alive". `cleanupStaleRuns` uses ONLY this lease —
 * never a run's or job's own elapsed running time — to decide whether a
 * previous daemon instance is genuinely gone. A lease still on file this
 * recently can only mean some process wrote it within the last
 * DAEMON_LEASE_TTL_MS; if that process isn't the one calling
 * `cleanupStaleRuns`, force-failing "running"/"queued" jobs would very likely
 * be abandoning work a still-live sibling instance owns, not cleaning up
 * after a dead one. Kept well short of RUN_TTL_MS on purpose — a run/job can
 * legitimately run for tens of minutes, but no legitimate single daemon
 * instance should ever go this long without renewing its own lease.
 */
export const DAEMON_LEASE_TTL_MS = 45_000 // 45s

/** How often a live daemon should call `writeDaemonLease` to keep its lease
 * fresh — comfortably under `DAEMON_LEASE_TTL_MS` so a normal GC pause or a
 * slow cache round-trip never lets the lease lapse on its own. */
export const DAEMON_LEASE_HEARTBEAT_INTERVAL_MS = 15_000 // 15s

const DAEMON_LEASE_KEY = 'kb:daemon:lease'

export interface DaemonLease {
  instanceId: string
  heartbeatAt: string
}

export class StateStore {
  private readonly cache: ICache

  constructor(
    cache: ICache,
    private readonly logger: EngineLogger,
  ) {
    this.cache = cache
  }

  async saveRun(run: WorkflowRun): Promise<void> {
    const key = `kb:run:${run.id}`
    this.logger.debug('Persisting workflow run', { runId: run.id, key })

    // Save run data
    await this.cache.set(key, JSON.stringify(run), RUN_TTL_MS)

    // Add to sorted set index (score = createdAt timestamp for time-based ordering)
    const timestamp = new Date(run.createdAt).getTime()
    await this.cache.zadd('workflow:runs:index', timestamp, run.id)
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    const key = `kb:run:${runId}`
    const payload = await this.cache.get<string>(key)
    if (!payload) {
      return null
    }
    try {
      return JSON.parse(payload) as WorkflowRun
    } catch (error) {
      this.logger.error('Failed to parse stored workflow run', error instanceof Error ? error : undefined, {
        runId,
      })
      return null
    }
  }

  async deleteRun(runId: string): Promise<void> {
    const key = `kb:run:${runId}`

    // Remove from cache
    await this.cache.delete(key)

    // Remove from sorted set index
    await this.cache.zrem('workflow:runs:index', runId)
  }

  async getAllRunIds(): Promise<string[]> {
    // Get all run IDs from sorted set index (ordered by creation time)
    // Score range: -inf to +inf (all runs)
    const runIds = await this.cache.zrangebyscore('workflow:runs:index', -Infinity, Infinity)
    return runIds ?? []
  }

  /**
   * Read the current daemon liveness lease, if one is still on file. Returns
   * null both when no daemon has ever written one and when the last writer's
   * lease has expired (per `DAEMON_LEASE_TTL_MS`) — the cache backend itself
   * enforces that expiry, so a non-null result here is proof some process
   * heartbeated within the last `DAEMON_LEASE_TTL_MS`.
   */
  async getDaemonLease(): Promise<DaemonLease | null> {
    const raw = await this.cache.get<string>(DAEMON_LEASE_KEY)
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as DaemonLease
    } catch (error) {
      this.logger.error('Failed to parse stored daemon lease', error instanceof Error ? error : undefined)
      return null
    }
  }

  /**
   * Claim (or renew) the daemon liveness lease under `instanceId`, valid for
   * `DAEMON_LEASE_TTL_MS`. Called once at startup after `cleanupStaleRuns`
   * decides this instance is safe to proceed as the active daemon, and then
   * periodically for as long as the daemon stays up, so its lease never
   * lapses while it's genuinely alive.
   */
  async writeDaemonLease(instanceId: string): Promise<void> {
    const lease: DaemonLease = { instanceId, heartbeatAt: new Date().toISOString() }
    await this.cache.set(DAEMON_LEASE_KEY, JSON.stringify(lease), DAEMON_LEASE_TTL_MS)
  }

  /**
   * Holds an exclusive per-run lock (see `withLock`) for the whole
   * read-modify-write, so `mutator` runs exactly once per call — no other
   * writer can observe or clobber the run in between. This is what actually
   * fixes the original bug class (a job marked `failed` while its step was
   * mid-write to `waiting_approval`): the two writes can no longer interleave.
   *
   * `mutator` must still not `await` — it runs synchronously against a
   * single in-memory draft while the lock is held; async work belongs after
   * `updateRun` resolves (and holding the lock across an `await` would just
   * make every other writer to this run block on it needlessly).
   */
  async updateRun(
    runId: string,
    mutator: (draft: WorkflowRun) => WorkflowRun | void,
  ): Promise<WorkflowRun | null> {
    return withLock(this.cache, `kb:lock:run:${runId}`, async () => {
      const run = await this.getRun(runId)
      if (!run) {
        return null
      }

      const draft = clone(run)
      const result = mutator(draft)
      const next = (result ?? draft) as WorkflowRun
      await this.saveRun(next)
      return next
    })
  }

  async updateJob(
    runId: string,
    jobId: string,
    mutator: (job: JobRun) => JobRun | void,
  ): Promise<JobRun | null> {
    let updatedJob: JobRun | null = null

    await this.updateRun(runId, (run) => {
      const index = run.jobs.findIndex((job: JobRun) => job.id === jobId)
      if (index === -1) {
        return
      }
      const existingJob = run.jobs[index]
      if (!existingJob) {
        return
      }
      const jobDraft = clone(existingJob)
      const result = mutator(jobDraft)
      const nextJob = (result ?? jobDraft) as JobRun
      run.jobs[index] = nextJob
      updatedJob = nextJob
    })

    return updatedJob
  }

  async updateStep(
    runId: string,
    jobId: string,
    stepId: string,
    mutator: (step: StepRun) => StepRun | void,
  ): Promise<StepRun | null> {
    let updatedStep: StepRun | null = null

    await this.updateRun(runId, (run) => {
      const jobIndex = run.jobs.findIndex((job) => job.id === jobId)
      if (jobIndex === -1) {
        return
      }
      const job = run.jobs[jobIndex]
      if (!job) {
        return
      }
      const stepIndex = job.steps.findIndex(
        (step: StepRun) => step.id === stepId,
      )
      if (stepIndex === -1) {
        return
      }
      const existingStep = job.steps[stepIndex]
      if (!existingStep) {
        return
      }
      const draft = clone(existingStep)
      const result = mutator(draft)
      const nextStep = (result ?? draft) as StepRun
      job.steps[stepIndex] = nextStep
      updatedStep = nextStep
    })

    return updatedStep
  }

  /**
   * Like `updateRun`, but validates the status transition against the
   * workflow state machine before applying it — throws
   * `IllegalStateTransitionError` (from `@kb-labs/workflow-constants`) if
   * `to` is not reachable from the run's current status. `mutate` sets any
   * *other* fields; it must not itself assign `.status` (this method owns
   * that assignment, after the check).
   */
  async transitionRun(
    runId: string,
    to: WorkflowRun['status'],
    mutate: (draft: WorkflowRun) => void = () => {},
    options?: AssertTransitionOptions,
  ): Promise<WorkflowRun | null> {
    return this.updateRun(runId, (draft) => {
      assertTransition('run', draft.status, to, options)
      draft.status = to
      mutate(draft)
    })
  }

  /** Job-level counterpart of `transitionRun` — see its docblock. */
  async transitionJob(
    runId: string,
    jobId: string,
    to: JobRun['status'],
    mutate: (draft: JobRun) => void = () => {},
    options?: AssertTransitionOptions,
  ): Promise<JobRun | null> {
    return this.updateJob(runId, jobId, (draft) => {
      assertTransition('job', draft.status, to, options)
      draft.status = to
      mutate(draft)
    })
  }

  /** Step-level counterpart of `transitionRun` — see its docblock. */
  async transitionStep(
    runId: string,
    jobId: string,
    stepId: string,
    to: StepRun['status'],
    mutate: (draft: StepRun) => void = () => {},
    options?: AssertTransitionOptions,
  ): Promise<StepRun | null> {
    return this.updateStep(runId, jobId, stepId, (draft) => {
      assertTransition('step', draft.status, to, options)
      draft.status = to
      mutate(draft)
    })
  }

  async releaseBlockedJobs(
    runId: string,
    completedJobName: string,
  ): Promise<JobRun[]> {
    // `released` is reset at the top of the mutator rather than declared
    // once outside it. `updateRun` now holds an exclusive lock for the whole
    // call, so in the current design this mutator only ever runs once per
    // call — but keeping the reset here is cheap, correct defense-in-depth
    // against ever accumulating into a variable captured from an outer
    // scope, which is exactly what caused a real bug when `updateRun`'s
    // internals worked differently (a retry-on-conflict scheme, prior to the
    // locking approach): a re-run mutator pushed into the same array again,
    // so callers double-processed the same released job.
    let released: JobRun[] = []

    await this.updateRun(runId, (run) => {
      released = []
      for (const job of run.jobs) {
        if (job.status !== 'queued' || !job.blocked) {
          continue
        }
        if (!job.pendingDependencies || job.pendingDependencies.length === 0) {
          continue
        }
        if (!job.needs?.includes(completedJobName)) {
          continue
        }

        const remaining = job.pendingDependencies.filter(
          (dependency) => dependency !== completedJobName,
        )

        if (remaining.length === job.pendingDependencies.length) {
          continue
        }

        job.pendingDependencies = remaining

        if (remaining.length === 0) {
          job.blocked = false
          released.push(clone(job))
        }
      }
    })

    return released
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}



