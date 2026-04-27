/**
 * HTTP client for interacting with Workflow Daemon
 */
import type {
  WorkflowRunRequest,
  JobStatusInfo,
  JobStepsResponse,
  JobLogsResponse,
  CronListResponse,
} from '@kb-labs/workflow-contracts';
import { useEnv } from '@kb-labs/sdk';

/** Metrics data returned by GET /metrics */
export interface WorkflowMetricsData {
  runs: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  jobs: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  [key: string]: unknown;
}

/** Extended job status returned by GET /api/v1/jobs/:id — includes nested jobs/steps */
export interface JobStatusDetail extends Omit<JobStatusInfo, 'result'> {
  result?: {
    ok: boolean;
    summary?: string;
    error?: { code: string; message: string };
  };
  jobs?: Array<{
    id: string;
    name: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    error?: string;
    steps?: Array<{
      id: string;
      name: string;
      status: string;
      handler?: string;
      startedAt?: string;
      finishedAt?: string;
      durationMs?: number;
      outputs?: Record<string, unknown>;
      error?: { message?: string } | string;
    }>;
  }>;
}

const DEFAULT_DAEMON_URL = 'http://localhost:7778';

export interface DaemonClientOptions {
  url?: string;
}

/**
 * Get workflow daemon URL from environment or default
 */
export function getWorkflowDaemonUrl(): string {
  return useEnv('WORKFLOW_DAEMON_URL') ?? DEFAULT_DAEMON_URL;
}

export class WorkflowDaemonClient {
  private readonly baseUrl: string;

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl = options.url ?? useEnv('WORKFLOW_DAEMON_URL') ?? DEFAULT_DAEMON_URL;
  }

  /**
   * Validate response Content-Type and parse JSON safely
   */
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new Error(`Invalid Content-Type: expected application/json, got ${contentType}`);
    }
    return response.json() as Promise<T>;
  }

  private unwrapData<T>(payload: unknown): T {
    if (
      payload
      && typeof payload === 'object'
      && 'ok' in payload
      && (payload as { ok?: boolean }).ok === true
      && 'data' in payload
    ) {
      return (payload as { data: T }).data;
    }
    return payload as T;
  }

  /**
   * Validate and encode job ID to prevent path traversal attacks
   */
  private validateAndEncodeJobId(jobId: string): string {
    // Validate job ID format (alphanumeric, hyphens, underscores only)
    if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
      throw new Error(`Invalid job ID format: ${jobId}`);
    }
    // Encode for URL safety (defense in depth)
    return encodeURIComponent(jobId);
  }

  /**
   * Health check
   */
  async health(): Promise<{ ok: boolean; service: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return this.parseJsonResponse(response);
  }

  /**
   * Get workflow metrics (raw metrics data from daemon)
   */
  async getMetrics(): Promise<WorkflowMetricsData> {
    const response = await fetch(`${this.baseUrl}/metrics`);
    if (!response.ok) {
      throw new Error(`Failed to get metrics: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    return this.unwrapData<WorkflowMetricsData>(data);
  }

  /**
   * Get job status with full details (jobs, steps, outputs)
   */
  async getJobStatus(jobId: string): Promise<JobStatusDetail> {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    return this.unwrapData<JobStatusDetail>(data);
  }

  /**
   * Get job steps with outputs
   */
  async getJobSteps(jobId: string): Promise<JobStepsResponse> {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}/steps`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job steps: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    return this.unwrapData<JobStepsResponse>(data);
  }

  /**
   * Get job logs
   */
  async getJobLogs(jobId: string): Promise<JobLogsResponse['logs']> {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}/logs`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job logs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    const unwrapped = this.unwrapData<JobLogsResponse>(data);
    return unwrapped.logs ?? [];
  }

  /**
   * Get active executions
   */
  async getExecutions(): Promise<JobStatusInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/jobs`);
    if (!response.ok) {
      throw new Error(`Failed to get executions: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    const unwrapped = this.unwrapData<{ jobs?: JobStatusInfo[] }>(data);
    const jobs = unwrapped.jobs ?? [];
    return jobs.filter((job) => job.status === 'running' || job.status === 'pending');
  }

  /**
   * Get cron jobs
   */
  async getCronJobs(): Promise<CronListResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/cron`);
    if (!response.ok) {
      throw new Error(`Failed to get cron jobs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    return this.unwrapData<CronListResponse>(data);
  }

  /**
   * Submit a job for execution
   */
  async submitJob(params: {
    handler: string;
    input?: unknown;
    priority?: number;
  }): Promise<{ id: string; status: string }> {
    const response = await fetch(`${this.baseUrl}/api/v1/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: params.handler,
        payload: params.input,
        priority: params.priority,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: response.statusText }))) as {
        error?: string;
      };
      throw new Error(error.error || `Failed to submit job: ${response.statusText}`);
    }

    const payload = await this.parseJsonResponse<unknown>(response);
    const data = this.unwrapData<{ jobId: string }>(payload);
    return { id: data.jobId, status: 'pending' };
  }

  /**
   * Run workflow by ID
   */
  async runWorkflow(
    workflowId: string,
    request: WorkflowRunRequest = {}
  ): Promise<{ runId: string; status: string }> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/runs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: response.statusText }))) as {
        error?: string;
      };
      throw new Error(error.error || `Failed to run workflow: ${response.statusText}`);
    }

    const payload = await this.parseJsonResponse<{ ok: boolean; data?: { runId: string; status: string } }>(response);
    return this.unwrapData<{ runId: string; status: string }>(payload);
  }
}
