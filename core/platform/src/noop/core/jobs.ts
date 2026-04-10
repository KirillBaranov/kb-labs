/**
 * @module @kb-labs/core-platform/noop/core/jobs
 * NoOp job scheduler implementation.
 */

import type {
  IJobScheduler,
  JobDefinition,
  JobHandle,
  JobFilter,
  CronExpression,
} from '../../core/jobs.js';

/**
 * NoOp job scheduler that executes jobs synchronously.
 * Useful for testing without background processing.
 */
export class NoOpJobScheduler implements IJobScheduler {
  private jobs = new Map<string, JobHandle>();
  private idCounter = 0;

  async submit(job: JobDefinition): Promise<JobHandle> {
    const id = `noop-job-${++this.idCounter}`;
    const handle: JobHandle = {
      id,
      type: job.type,
      tenantId: job.tenantId ?? 'default',
      status: 'completed',
      createdAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
    };

    this.jobs.set(id, handle);
    return handle;
  }

  async schedule(
    job: JobDefinition,
    _schedule: CronExpression | Date
  ): Promise<JobHandle> {
    // In NoOp mode, scheduled jobs are just submitted immediately
    return this.submit(job);
  }

  async cancel(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    job.status = 'cancelled';
    return true;
  }

  async getStatus(jobId: string): Promise<JobHandle | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async list(filter?: JobFilter): Promise<JobHandle[]> {
    let results = Array.from(this.jobs.values());

    if (filter?.type) {
      results = results.filter((j) => j.type === filter.type);
    }
    if (filter?.status) {
      results = results.filter((j) => j.status === filter.status);
    }
    if (filter?.tenantId) {
      results = results.filter((j) => j.tenantId === filter.tenantId);
    }

    return results;
  }

  /**
   * Clear all jobs (for testing).
   */
  clear(): void {
    this.jobs.clear();
    this.idCounter = 0;
  }
}
