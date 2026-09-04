/**
 * HTTP client for interacting with Workflow Daemon
 */
import type {
  WorkflowRerunRequest,
  WorkflowRestartRequest,
  WorkflowRestartResponse,
  WorkflowRunRequest,
  JobStatusInfo,
  JobStepsResponse,
  JobLogsResponse,
  CronListResponse,
  WorkflowInfo,
  WorkflowListResponse,
} from '@kb-labs/workflow-contracts';
import { useEnv } from '@kb-labs/sdk';

/** Workflow run summary returned by GET /api/v1/runs */
export interface WorkflowRunSummary {
  id: string;
  name: string;
  version?: string;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  trigger?: {
    type: string;
    actor?: string;
    payload?: unknown;
    parentRunId?: string;
    parentJobId?: string;
    parentStepId?: string;
  };
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  inputs?: Record<string, unknown>;
  hasPendingApproval?: boolean;
  currentStepName?: string;
}

/** Full workflow run detail returned by GET /api/v1/runs/:runId */
export interface WorkflowRunDetail extends WorkflowRunSummary {
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
  result?: {
    status: string;
    summary?: string;
    error?: { message: string; code?: string };
    outputs?: Record<string, unknown>;
  };
  jobs?: Array<{
    id: string;
    jobName?: string;
    status: string;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    attempt?: number;
    error?: { message: string; code?: string; stack?: string } | string;
    steps?: Array<{
      id: string;
      name?: string;
      index?: number;
      status: string;
      startedAt?: string;
      finishedAt?: string;
      durationMs?: number;
      attempt?: number;
      outputs?: Record<string, unknown>;
      resolvedInputs?: Record<string, unknown>;
      error?: { message: string; code?: string; details?: Record<string, unknown> } | string;
      spec?: Record<string, unknown>;
    }>;
  }>;
}

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
   * List workflow definitions, optionally filtered by source/status/tags
   */
  async listWorkflows(params: {
    source?: string;
    status?: string;
    tags?: string;
  } = {}): Promise<WorkflowInfo[]> {
    const query = new URLSearchParams();
    if (params.source) { query.set('source', params.source); }
    if (params.status) { query.set('status', params.status); }
    if (params.tags) { query.set('tags', params.tags); }

    const qs = query.toString();
    const response = await fetch(`${this.baseUrl}/api/v1/workflows${qs ? `?${qs}` : ''}`);
    if (!response.ok) {
      throw new Error(`Failed to list workflows: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    const unwrapped = this.unwrapData<WorkflowListResponse>(data);
    return unwrapped.workflows ?? [];
  }

  /**
   * Get a specific workflow definition by ID
   */
  async getWorkflow(id: string): Promise<WorkflowInfo> {
    const encodedId = encodeURIComponent(id);
    const response = await fetch(`${this.baseUrl}/api/v1/workflows/${encodedId}`);
    if (response.status === 404) {
      throw new Error(`Workflow ${id} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get workflow: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    return this.unwrapData<WorkflowInfo>(data);
  }

  /**
   * List workflow runs with optional status filter
   */
  async listRuns(params: {
    status?: string;
    limit?: number;
    workflowId?: string;
  } = {}): Promise<WorkflowRunSummary[]> {
    const query = new URLSearchParams();
    if (params.status) { query.set('status', params.status); }
    if (params.limit) { query.set('limit', String(params.limit)); }
    if (params.workflowId) { query.set('workflowId', params.workflowId); }

    const qs = query.toString();
    const response = await fetch(`${this.baseUrl}/api/v1/runs${qs ? `?${qs}` : ''}`);
    if (!response.ok) {
      throw new Error(`Failed to list runs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    const unwrapped = this.unwrapData<{ runs?: WorkflowRunSummary[] }>(data);
    return unwrapped.runs ?? (Array.isArray(data) ? data as WorkflowRunSummary[] : []);
  }

  /**
   * Get a specific workflow run with full detail
   */
  async getRun(runId: string): Promise<WorkflowRunDetail> {
    const encodedId = encodeURIComponent(runId);
    const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}`);
    if (response.status === 404) {
      throw new Error(`Run ${runId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get run: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    // Response shape: { ok: true, data: { run: {...} } }
    const unwrapped = this.unwrapData<{ run?: WorkflowRunDetail } | WorkflowRunDetail>(data);
    return ('run' in (unwrapped as object) ? (unwrapped as { run: WorkflowRunDetail }).run : unwrapped) as WorkflowRunDetail;
  }

  /**
   * Get run logs, optionally filtered to failed steps only
   */
  async getRunLogs(runId: string, params: {
    stepId?: string;
    level?: string;
    limit?: number;
    failedOnly?: boolean;
  } = {}): Promise<Array<{ level: string; message: string; timestamp: string; stepId?: string; stepName?: string; stream?: string; [key: string]: unknown }>> {
    const query = new URLSearchParams();
    if (params.stepId) { query.set('stepId', params.stepId); }
    if (params.level) { query.set('level', params.level); }
    if (params.limit) { query.set('limit', String(params.limit)); }
    if (params.failedOnly) { query.set('failedOnly', 'true'); }

    const encodedId = encodeURIComponent(runId);
    const qs = query.toString();
    const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}/logs${qs ? `?${qs}` : ''}`);
    if (response.status === 404) {
      throw new Error(`Run ${runId} not found`);
    }
    if (!response.ok) {
      throw new Error(`Failed to get run logs: ${response.statusText}`);
    }
    const data = await this.parseJsonResponse<unknown>(response);
    const unwrapped = this.unwrapData<{ logs?: unknown[] }>(data);
    return (unwrapped.logs ?? []) as Array<{ level: string; message: string; timestamp: string; [key: string]: unknown }>;
  }

  /**
   * Stream run events via SSE (returns a ReadableStream or EventSource-compatible URL)
   */
  getRunEventsUrl(runId: string): string {
    return `${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/events`;
  }

  /**
   * List pending approval steps for a run
   */
  async listPendingApprovals(runId: string): Promise<{
    runId: string;
    pending: Array<{
      jobId: string;
      stepId: string;
      stepName: string;
      specId?: string;
      context: Record<string, unknown>;
      waitingSince?: string;
    }>;
  }> {
    const encodedId = encodeURIComponent(runId);
    const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}/approvals`);
    if (!response.ok) {
      const message = await response
        .json()
        .then((j: { error?: string }) => j?.error ?? '')
        .catch(() => response.text().catch(() => ''));
      throw new Error(`Failed to list pending approvals: ${message || response.statusText || response.status}`);
    }
    const payload = await this.parseJsonResponse<{
      ok: boolean;
      data?: {
        runId: string;
        pending: Array<{
          jobId: string;
          stepId: string;
          stepName: string;
          specId?: string;
          context: Record<string, unknown>;
          waitingSince?: string;
        }>;
      };
    }>(response);
    return this.unwrapData(payload);
  }

  /**
   * Resolve (approve or reject) a pending approval step
   */
  async resolveApproval(
    runId: string,
    jobId: string,
    stepId: string,
    action: 'approve' | 'reject',
    comment?: string,
    data?: Record<string, unknown>
  ): Promise<{ runId: string; jobId: string; stepId: string; action: string; resolved: boolean }> {
    const encodedId = encodeURIComponent(runId);
    const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}/approvals/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, stepId, action, comment, data }),
    });
    if (!response.ok) {
      const message = await response
        .json()
        .then((j: { error?: string }) => j?.error ?? '')
        .catch(() => response.text().catch(() => ''));
      throw new Error(`Failed to resolve approval: ${message || response.statusText || response.status}`);
    }
    const payload = await this.parseJsonResponse<{
      ok: boolean;
      data?: { runId: string; jobId: string; stepId: string; action: string; resolved: boolean };
    }>(response);
    return this.unwrapData(payload);
  }

  /**
   * Cancel a workflow run
   */
  async cancelRun(runId: string): Promise<void> {
    const encodedId = encodeURIComponent(runId);
    const response = await fetch(`${this.baseUrl}/api/v1/runs/${encodedId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      const message = await response
        .json()
        .then((j: { error?: string }) => j?.error ?? '')
        .catch(() => response.text().catch(() => ''));
      throw new Error(`Failed to cancel run: ${message || response.statusText || response.status}`);
    }
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

  /**
   * Rerun a workflow run by ID, optionally only failed jobs
   */
  async rerunWorkflow(
    runId: string,
    request: WorkflowRerunRequest = {},
  ): Promise<{ runId: string; status: string }> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/rerun`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: response.statusText }))) as {
        error?: string;
      };
      throw new Error(error.error || `Failed to rerun workflow: ${response.statusText}`);
    }

    const payload = await this.parseJsonResponse<{ ok: boolean; data?: { runId: string; status: string } }>(response);
    return this.unwrapData<{ runId: string; status: string }>(payload);
  }

  /**
   * Restart a run from a snapshot, optionally resuming from a specific step.
   * Preceding steps inherit their stored outputs; only the target step and beyond are re-executed.
   */
  async restartRun(
    runId: string,
    request: WorkflowRestartRequest = {},
  ): Promise<WorkflowRestartResponse> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/runs/${encodeURIComponent(runId)}/restart`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      },
    );

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ error: response.statusText }))) as {
        error?: string;
      };
      throw new Error(error.error || `Failed to restart run: ${response.statusText}`);
    }

    const payload = await this.parseJsonResponse<{ ok: boolean; data?: WorkflowRestartResponse }>(response);
    return this.unwrapData<WorkflowRestartResponse>(payload);
  }
}
