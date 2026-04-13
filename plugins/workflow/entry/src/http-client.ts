/**
 * HTTP client for interacting with Workflow Daemon
 */
import type { WorkflowRunRequest } from '@kb-labs/workflow-contracts';
import { useEnv } from '@kb-labs/sdk';

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
      && (payload as any).ok === true
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
   * Get workflow metrics
   */
  async getMetrics(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/metrics`);
    if (!response.ok) {
      throw new Error(`Failed to get metrics: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<any>(response);
    return this.unwrapData(data);
  }

  /**
   * Get job status with full details (jobs, steps, outputs)
   */
  async getJobStatus(jobId: string): Promise<any> {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<any>(response);
    return this.unwrapData(data);
  }

  /**
   * Get job steps with outputs
   */
  async getJobSteps(jobId: string): Promise<any> {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}/steps`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job steps: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<any>(response);
    return this.unwrapData(data);
  }

  /**
   * Get job logs
   */
  async getJobLogs(jobId: string): Promise<any[]> {
    const encodedJobId = this.validateAndEncodeJobId(jobId);
    const response = await fetch(`${this.baseUrl}/api/v1/jobs/${encodedJobId}/logs`);
    if (response.status === 404) {
      throw new Error(`Job ${jobId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get job logs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<any>(response);
    const unwrapped = this.unwrapData<{ logs: any[] }>(data);
    return unwrapped.logs ?? [];
  }

  /**
   * Get active executions
   */
  async getExecutions(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/jobs`);
    if (!response.ok) {
      throw new Error(`Failed to get executions: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<any>(response);
    const unwrapped = this.unwrapData<{ jobs?: any[] }>(data);
    const jobs = unwrapped.jobs ?? [];
    return jobs.filter((job: any) => job.status === 'running' || job.status === 'pending');
  }

  /**
   * Get cron jobs
   */
  async getCronJobs(): Promise<{
    crons: any[];
  }> {
    const response = await fetch(`${this.baseUrl}/api/v1/cron`);
    if (!response.ok) {
      throw new Error(`Failed to get cron jobs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<any>(response);
    return this.unwrapData(data);
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

    const payload = await this.parseJsonResponse<any>(response);
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
      `${this.baseUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/run`,
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
