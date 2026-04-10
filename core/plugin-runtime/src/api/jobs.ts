/**
 * Jobs API implementation
 *
 * HTTP client adapter for Workflow Service Jobs API.
 * Makes REST API calls instead of in-process manager calls.
 */

import type {
  JobsAPI,
  JobSubmission,
  JobStatusInfo,
  JobListFilter,
  JobWaitOptions,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';

export interface CreateJobsAPIOptions {
  tenantId?: string;
  workflowServiceUrl: string;
  permissions?: PermissionSpec;
}

/**
 * Check if job operation is allowed by permissions
 */
function checkJobPermission(
  permissions: PermissionSpec | undefined,
  operation: 'submit' | 'list' | 'cancel',
  jobType?: string
): void {
  const jobPerms = permissions?.platform?.jobs;

  // If jobs is false or undefined, no access
  if (jobPerms === false || jobPerms === undefined) {
    throw new Error('Job scheduler access denied: missing platform.jobs permission');
  }

  // If jobs is true, all operations allowed
  if (jobPerms === true) {
    return;
  }

  // If jobs is object, check specific operation
  if (typeof jobPerms === 'object') {
    if (!jobPerms[operation]) {
      throw new Error(
        `Job operation '${operation}' denied: missing platform.jobs.${operation} permission`
      );
    }

    // Check job type scope if specified
    if (jobType && jobPerms.types) {
      const allowed = jobPerms.types.some((pattern: string) => {
        if (pattern === '*') {return true;}
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1);
          return jobType.startsWith(prefix);
        }
        return pattern === jobType;
      });

      if (!allowed) {
        throw new Error(
          `Job type '${jobType}' access denied: not in allowed types scope`
        );
      }
    }
  }
}

/**
 * Create JobsAPI HTTP client
 *
 * Makes REST API calls to Workflow Service instead of in-process calls.
 */
export function createJobsAPI(options: CreateJobsAPIOptions): JobsAPI {
  const { tenantId, workflowServiceUrl, permissions } = options;

  const fetchJSON = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const url = `${workflowServiceUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': tenantId ?? 'default',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Workflow Service request failed: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<T>;
  };

  return {
    async submit(submission: JobSubmission): Promise<string> {
      checkJobPermission(permissions, 'submit', submission.type);

      const response = await fetchJSON<{ jobId: string }>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          type: submission.type,
          payload: submission.payload,
          priority: submission.priority,
          maxRetries: submission.maxRetries,
          timeout: submission.timeout,
          runAt: submission.runAt,
          idempotencyKey: submission.idempotencyKey,
        }),
      });

      return response.jobId;
    },

    async schedule(job: JobSubmission, schedule: string | Date): Promise<string> {
      checkJobPermission(permissions, 'submit', job.type);

      // Convert schedule to runAt date
      const runAt = typeof schedule === 'string'
        ? new Date(schedule) // For ISO date strings or we'd need cron parser
        : schedule;

      const response = await fetchJSON<{ jobId: string }>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          type: job.type,
          payload: job.payload,
          priority: job.priority,
          maxRetries: job.maxRetries,
          timeout: job.timeout,
          runAt,
          idempotencyKey: job.idempotencyKey,
        }),
      });

      return response.jobId;
    },

    async status(jobId: string): Promise<JobStatusInfo | null> {
      try {
        return await fetchJSON<JobStatusInfo>(`/api/jobs/${jobId}`);
      } catch (error) {
        // 404 means job not found
        if (error instanceof Error && error.message.includes('404')) {
          return null;
        }
        throw error;
      }
    },

    async wait(jobId: string, options?: JobWaitOptions): Promise<unknown> {
      const timeout = options?.timeout ?? 300000; // 5min default
      const pollInterval = options?.pollInterval ?? 1000; // 1s default
      const startTime = Date.now();

      while (true) {
        const info = await this.status(jobId);

        if (!info) {
          throw new Error(`Job not found: ${jobId}`);
        }

        // Check if completed
        if (info.status === 'completed') {
          return info.result;
        }

        // Check if failed
        if (info.status === 'failed') {
          throw new Error(`Job failed: ${info.error ?? 'Unknown error'}`);
        }

        // Check if cancelled
        if (info.status === 'cancelled') {
          throw new Error('Job was cancelled');
        }

        // Check timeout
        if (Date.now() - startTime > timeout) {
          throw new Error(`Job wait timeout after ${timeout}ms`);
        }

        // Wait before next poll
        await new Promise(resolve => {
          setTimeout(resolve, pollInterval);
        });
      }
    },

    async cancel(jobId: string): Promise<boolean> {
      checkJobPermission(permissions, 'cancel');

      const response = await fetchJSON<{ cancelled: boolean }>(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
      });

      return response.cancelled;
    },

    async list(filter?: JobListFilter): Promise<JobStatusInfo[]> {
      checkJobPermission(permissions, 'list');

      const queryParams = new URLSearchParams();
      if (filter?.type) {queryParams.set('type', filter.type);}
      if (filter?.status) {queryParams.set('status', filter.status);}
      if (filter?.limit) {queryParams.set('limit', String(filter.limit));}
      if (filter?.offset) {queryParams.set('offset', String(filter.offset));}

      const query = queryParams.toString();
      const path = query ? `/api/jobs?${query}` : '/api/jobs';

      const response = await fetchJSON<{ jobs: JobStatusInfo[] }>(path);
      return response.jobs;
    },
  };
}

/**
 * Create noop JobsAPI (when job scheduler is not available)
 */
export function createNoopJobsAPI(): JobsAPI {
  const notAvailable = () => {
    throw new Error('Job scheduler not available in this context');
  };

  return {
    submit: notAvailable,
    schedule: notAvailable,
    status: async () => null,
    wait: notAvailable,
    cancel: async () => false,
    list: async () => [],
  };
}
