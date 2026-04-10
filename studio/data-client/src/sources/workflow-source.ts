import type {
  WorkflowRun,
  WorkflowSpec,
  WorkflowRunsListResponse,
  WorkflowPresenterEvent,
} from '../contracts/workflows';

export interface WorkflowRunsFilters {
  status?: string;
  limit?: number;
}

export interface WorkflowRunParams {
  spec: WorkflowSpec;
  idempotencyKey?: string;
  concurrencyGroup?: string;
  metadata?: Record<string, unknown>;
}

// Types from workflow-contracts (будут импортированы из пакета)
export interface DashboardStatsResponse {
  workflows: {
    total: number;
    active: number;
    inactive: number;
  };
  jobs: {
    running: number;
    pending: number;
    completed: number;
    failed: number;
  };
  crons: {
    total: number;
    enabled: number;
    disabled: number;
  };
  activeExecutions: Array<{
    id: string;
    type: string;
    workflowName?: string;
    status: 'running';
    progress?: number;
    progressMessage?: string;
    startedAt: string;
    durationMs?: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    workflowName?: string;
    status: 'completed' | 'failed' | 'cancelled';
    finishedAt: string;
    durationMs?: number;
    error?: string;
  }>;
}

export interface WorkflowInfo {
  id: string;
  name: string;
  description?: string;
  source: 'manifest' | 'standalone';
  pluginId?: string;
  status?: 'active' | 'inactive';
  tags?: string[];
  inputs?: Record<string, { type: 'string' | 'number' | 'boolean'; description?: string; required?: boolean; default?: unknown }>;
}

export interface WorkflowListResponse {
  workflows: WorkflowInfo[];
}

export interface JobStatusInfo {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  tenantId?: string;
  priority?: number;
  createdAt?: Date | string;
  startedAt?: Date | string;
  finishedAt?: Date | string;
  attempt?: number;
  maxRetries?: number;
  result?: unknown;
  error?: string;
  progress?: number;
  progressMessage?: string;
}

export interface JobListFilter {
  type?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  limit?: number;
  offset?: number;
}

export interface JobListResponse {
  jobs: JobStatusInfo[];
}

export interface JobStepInfo {
  name: string;
  handler?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  output?: unknown;
}

export interface JobStepsResponse {
  jobId: string;
  workflowName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  steps: JobStepInfo[];
  currentStep?: number;
}

export interface JobLogsResponse {
  jobId: string;
  logs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    context?: Record<string, unknown>;
  }>;
  total: number;
  hasMore: boolean;
}

export interface CronInfo {
  id: string;
  schedule: string;
  jobType: string;
  timezone?: string;
  enabled: boolean;
  lastRun?: Date | string;
  nextRun?: Date | string;
  pluginId?: string;
}

export interface CronListResponse {
  crons: CronInfo[];
}

export interface WorkflowRunInfo {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  trigger: {
    type: 'manual' | 'api' | 'cron';
    user?: string;
  };
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
}

export interface WorkflowRunHistoryResponse {
  workflowId: string;
  runs: WorkflowRunInfo[];
  total: number;
}

export interface PendingApproval {
  jobId: string;
  stepId: string;
  stepName: string;
  specId?: string;
  context: Record<string, unknown>;
  waitingSince?: string;
}

export interface PendingApprovalsResponse {
  runId: string;
  pending: PendingApproval[];
}

export interface ResolveApprovalParams {
  runId: string;
  jobId: string;
  stepId: string;
  action: 'approve' | 'reject';
  comment?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowDataSource {
  // ✅ Existing methods
  listRuns(filters?: WorkflowRunsFilters): Promise<WorkflowRunsListResponse>;
  getRun(runId: string): Promise<WorkflowRun | null>;
  cancelRun(runId: string): Promise<WorkflowRun>;
  runWorkflow?(params: WorkflowRunParams): Promise<WorkflowRun>;
  getPendingApprovals?(runId: string): Promise<PendingApprovalsResponse>;
  resolveApproval?(params: ResolveApprovalParams): Promise<{ resolved: boolean }>;
  listEvents?(
    runId: string,
    options?: { cursor?: string | null; limit?: number },
  ): Promise<{ events: WorkflowPresenterEvent[]; cursor: string | null }>;

  // 🆕 NEW methods for UI
  getStats(): Promise<DashboardStatsResponse>;
  listWorkflows(filters?: { limit?: number }): Promise<WorkflowListResponse>;
  getWorkflow(workflowId: string): Promise<WorkflowInfo | null>;
  runWorkflowById(workflowId: string, input?: Record<string, unknown>): Promise<{ runId: string; status: string }>;
  listJobs(filters?: JobListFilter): Promise<JobListResponse>;
  getJob(jobId: string): Promise<JobStatusInfo | null>;
  getJobSteps(jobId: string): Promise<JobStepsResponse>;
  getJobLogs(
    jobId: string,
    filters?: { limit?: number; offset?: number; level?: string },
  ): Promise<JobLogsResponse>;
  listCronJobs(): Promise<CronListResponse>;
  getWorkflowRuns(
    workflowId: string,
    filters?: { limit?: number; offset?: number; status?: string },
  ): Promise<WorkflowRunHistoryResponse>;
  cancelWorkflowRun(runId: string): Promise<{ cancelled: boolean; runId: string }>;
}
