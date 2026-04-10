import type { JobRun, StepRun, WorkflowRun } from '@kb-labs/workflow-contracts'
import type { ICache } from '@kb-labs/core-platform'
import type { EngineLogger } from './types'

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
    await this.cache.set(key, JSON.stringify(run))

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

  async updateRun(
    runId: string,
    mutator: (draft: WorkflowRun) => WorkflowRun | void,
  ): Promise<WorkflowRun | null> {
    const run = await this.getRun(runId)
    if (!run) {
      return null
    }

    const draft = clone(run)
    const result = mutator(draft)
    const next = (result ?? draft) as WorkflowRun
    await this.saveRun(next)
    return next
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

  async releaseBlockedJobs(
    runId: string,
    completedJobName: string,
  ): Promise<JobRun[]> {
    const released: JobRun[] = []

    await this.updateRun(runId, (run) => {
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



