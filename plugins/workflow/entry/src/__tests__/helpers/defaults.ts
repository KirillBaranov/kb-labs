import type { WorkflowDaemonClient } from '../../http-client.js';
import type { WorkflowRunSummary, WorkflowRunDetail, JobStatusDetail } from '../../http-client.js';
import type { WorkflowRerunRequest, WorkflowRestartRequest, WorkflowRunRequest, WorkflowInfo } from '@kb-labs/workflow-contracts';

type WorkflowClientInstance = InstanceType<typeof WorkflowDaemonClient>;

/**
 * Returns a partial client stub cast to the full WorkflowDaemonClient type.
 * Use this in tests instead of `({...}) as never` to avoid unsafe casts.
 */
export function makeClient(overrides: Partial<WorkflowClientInstance>): WorkflowClientInstance {
  return overrides as unknown as WorkflowClientInstance;
}

/**
 * Default stub for WorkflowDaemonClient.
 * Every method returns a minimal valid response so tests only override what they care about.
 * Use: const client = mockObject(defaultWorkflowClient, { runWorkflow: async () => ... })
 */
export const defaultWorkflowClient: WorkflowDaemonClient = {
  health: async () => ({ ok: true, service: 'workflow' }),

  getMetrics: async () => ({
    runs: { total: 0, queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 },
    jobs: { total: 0, queued: 0, running: 0, completed: 0, failed: 0 },
  }),

  runWorkflow: async (_id: string, _req: WorkflowRunRequest) => ({ runId: 'run-test-123', status: 'queued' }),

  rerunWorkflow: async (_runId: string, _req: WorkflowRerunRequest) => ({ runId: 'run-test-rerun-123', status: 'queued' }),

  restartRun: async (_runId: string, _req: WorkflowRestartRequest) => ({ runId: 'run-test-restart-123', status: 'queued' }),

  listRuns: async () => [],

  getRun: async (runId: string): Promise<WorkflowRunDetail> => ({
    id: runId,
    name: 'test-workflow',
    status: 'running',
    createdAt: new Date().toISOString(),
  }),

  getRunLogs: async () => [],

  getRunEventsUrl: (runId: string) => `http://localhost:7778/api/v1/runs/${runId}/events`,

  cancelRun: async () => {},

  listPendingApprovals: async (runId: string) => ({ runId, pending: [] }),

  resolveApproval: async (runId: string, jobId: string, stepId: string, action: 'approve' | 'reject') => ({
    runId,
    jobId,
    stepId,
    action,
    resolved: true,
  }),

  getJobStatus: async (jobId: string): Promise<JobStatusDetail> => ({
    id: jobId,
    type: 'test',
    status: 'running',
    createdAt: new Date().toISOString(),
  }),

  getJobSteps: async () => ({ steps: [] }),

  getJobLogs: async () => [],

  getExecutions: async () => [],

  getCronJobs: async () => ({ crons: [] }),

  submitJob: async () => ({ id: 'job-test-123', status: 'pending' }),

  listWorkflows: async () => [],

  getWorkflow: async (id: string): Promise<WorkflowInfo> => ({
    id,
    name: 'test-workflow',
    source: 'manifest',
  }),
} as unknown as WorkflowDaemonClient;

export const sampleRunSummary: WorkflowRunSummary = {
  id: 'run-test-123',
  name: 'test-workflow',
  status: 'running',
  createdAt: new Date().toISOString(),
};

export const sampleWorkflowInfo: WorkflowInfo = {
  id: 'wf-test-123',
  name: 'test-workflow',
  source: 'manifest',
  status: 'active',
};
