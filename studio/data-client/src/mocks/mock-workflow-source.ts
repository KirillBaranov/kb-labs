import { ulid } from 'ulid';
import type {
  WorkflowDataSource,
  WorkflowRunsFilters,
  WorkflowRunParams,
  DashboardStatsResponse,
  WorkflowListResponse,
  WorkflowInfo,
  JobListFilter,
  JobListResponse,
  JobStatusInfo,
  JobStepsResponse,
  JobLogsResponse,
  CronListResponse,
  WorkflowRunHistoryResponse,
} from '../sources/workflow-source';
import type { WorkflowRun } from '../contracts/workflows';

function createMockRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  const now = new Date().toISOString();
  return {
    id: ulid(),
    name: 'demo-workflow',
    version: '1.0.0',
    status: 'success',
    createdAt: now,
    queuedAt: now,
    startedAt: now,
    finishedAt: now,
    trigger: {
      type: 'manual',
      actor: 'mock-user',
      payload: {},
    },
    jobs: [],
    artifacts: [],
    metadata: {},
    ...overrides,
  };
}

export class MockWorkflowSource implements WorkflowDataSource {
  private runs: WorkflowRun[] = [createMockRun()];

  async listRuns(_filters?: WorkflowRunsFilters) {
    return {
      runs: this.runs,
      total: this.runs.length,
    };
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    return this.runs.find(run => run.id === runId) ?? null;
  }

  async cancelRun(runId: string): Promise<WorkflowRun> {
    const run = await this.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }
    const updated = {
      ...run,
      status: 'cancelled' as WorkflowRun['status'],
      finishedAt: new Date().toISOString(),
    };
    this.runs = this.runs.map(existing => (existing.id === runId ? updated : existing));
    return updated;
  }

  async runWorkflow(params: WorkflowRunParams): Promise<WorkflowRun> {
    const run = createMockRun({
      id: ulid(),
      name: params.spec.name,
      version: params.spec.version,
      status: 'queued',
      metadata: params.metadata ?? {},
    });
    this.runs = [run, ...this.runs];
    return run;
  }

  async listEvents() {
    return {
      events: [],
      cursor: null,
    };
  }

  // 🆕 NEW mock methods for UI

  async getStats(): Promise<DashboardStatsResponse> {
    return {
      workflows: {
        total: 5,
        active: 3,
        inactive: 2,
      },
      jobs: {
        running: 2,
        pending: 1,
        completed: 15,
        failed: 3,
      },
      crons: {
        total: 4,
        enabled: 3,
        disabled: 1,
      },
      activeExecutions: [
        {
          id: 'job-1',
          type: 'workflow:demo',
          workflowName: 'Demo Workflow',
          status: 'running',
          progress: 45,
          progressMessage: 'Processing step 2 of 4',
          startedAt: new Date(Date.now() - 30000).toISOString(),
          durationMs: 30000,
        },
        {
          id: 'job-2',
          type: 'workflow:build',
          workflowName: 'Build Pipeline',
          status: 'running',
          progress: 75,
          progressMessage: 'Running tests',
          startedAt: new Date(Date.now() - 120000).toISOString(),
          durationMs: 120000,
        },
      ],
      recentActivity: [
        {
          id: 'job-3',
          type: 'workflow:deploy',
          workflowName: 'Deploy to Production',
          status: 'completed',
          finishedAt: new Date(Date.now() - 300000).toISOString(),
          durationMs: 180000,
        },
        {
          id: 'job-4',
          type: 'workflow:test',
          workflowName: 'Integration Tests',
          status: 'failed',
          finishedAt: new Date(Date.now() - 600000).toISOString(),
          durationMs: 45000,
          error: 'Test suite failed: 3 of 15 tests failed',
        },
      ],
    };
  }

  async listWorkflows(_filters?: { limit?: number }): Promise<WorkflowListResponse> {
    return {
      workflows: [
        {
          id: 'demo-workflow',
          name: 'Demo Workflow',
          description: 'Example workflow for testing',
          source: 'manifest',
          pluginId: 'demo-plugin',
          status: 'active',
          tags: ['demo', 'test'],
        },
        {
          id: 'build-pipeline',
          name: 'Build Pipeline',
          description: 'CI/CD build workflow',
          source: 'standalone',
          status: 'active',
          tags: ['ci', 'build'],
        },
        {
          id: 'deploy-prod',
          name: 'Deploy to Production',
          description: 'Production deployment workflow',
          source: 'manifest',
          pluginId: 'deploy-plugin',
          status: 'active',
          tags: ['deploy', 'production'],
        },
      ],
    };
  }

  async getWorkflow(workflowId: string): Promise<WorkflowInfo | null> {
    const workflows = await this.listWorkflows();
    return workflows.workflows.find((w) => w.id === workflowId) ?? null;
  }

  async runWorkflowById(
    workflowId: string,
    _input?: Record<string, unknown>,
  ): Promise<{ runId: string; status: string }> {
    const runId = ulid();
    console.log(`[MockWorkflowSource] Running workflow ${workflowId}, run ID: ${runId}`);
    return {
      runId,
      status: 'pending',
    };
  }

  async listJobs(filters?: JobListFilter): Promise<JobListResponse> {
    const mockJobs: JobStatusInfo[] = [
      {
        id: 'job-1',
        type: 'workflow:demo',
        status: 'running',
        priority: 5,
        createdAt: new Date(Date.now() - 60000).toISOString(),
        startedAt: new Date(Date.now() - 30000).toISOString(),
        attempt: 1,
        maxRetries: 3,
        progress: 45,
        progressMessage: 'Processing step 2 of 4',
      },
      {
        id: 'job-2',
        type: 'workflow:build',
        status: 'completed',
        priority: 8,
        createdAt: new Date(Date.now() - 300000).toISOString(),
        startedAt: new Date(Date.now() - 280000).toISOString(),
        finishedAt: new Date(Date.now() - 120000).toISOString(),
        attempt: 1,
        maxRetries: 3,
        result: { success: true },
      },
      {
        id: 'job-3',
        type: 'workflow:test',
        status: 'failed',
        priority: 5,
        createdAt: new Date(Date.now() - 600000).toISOString(),
        startedAt: new Date(Date.now() - 580000).toISOString(),
        finishedAt: new Date(Date.now() - 535000).toISOString(),
        attempt: 3,
        maxRetries: 3,
        error: 'Test suite failed: 3 of 15 tests failed',
      },
    ];

    let filtered = mockJobs;
    if (filters?.status) {
      filtered = filtered.filter((j) => j.status === filters.status);
    }
    if (filters?.type) {
      filtered = filtered.filter((j) => j.type.includes(filters.type!));
    }

    return { jobs: filtered };
  }

  async getJob(jobId: string): Promise<JobStatusInfo | null> {
    const jobs = await this.listJobs();
    return jobs.jobs.find((j) => j.id === jobId) ?? null;
  }

  async getJobSteps(jobId: string): Promise<JobStepsResponse> {
    return {
      jobId,
      workflowName: 'Demo Workflow',
      status: 'running',
      steps: [
        {
          name: 'checkout',
          handler: 'git-checkout',
          status: 'completed',
          startedAt: new Date(Date.now() - 120000).toISOString(),
          finishedAt: new Date(Date.now() - 110000).toISOString(),
          durationMs: 10000,
        },
        {
          name: 'build',
          handler: 'npm-build',
          status: 'running',
          progress: 65,
          startedAt: new Date(Date.now() - 110000).toISOString(),
        },
        {
          name: 'test',
          handler: 'npm-test',
          status: 'pending',
        },
        {
          name: 'deploy',
          handler: 'k8s-deploy',
          status: 'pending',
        },
      ],
      currentStep: 1,
    };
  }

  async getJobLogs(
    jobId: string,
    _filters?: { limit?: number; offset?: number; level?: string },
  ): Promise<JobLogsResponse> {
    return {
      jobId,
      logs: [
        {
          timestamp: new Date(Date.now() - 120000).toISOString(),
          level: 'info',
          message: 'Starting workflow execution',
          context: { step: 'init' },
        },
        {
          timestamp: new Date(Date.now() - 115000).toISOString(),
          level: 'info',
          message: 'Checking out code from repository',
          context: { step: 'checkout' },
        },
        {
          timestamp: new Date(Date.now() - 110000).toISOString(),
          level: 'info',
          message: 'Checkout completed successfully',
          context: { step: 'checkout', duration: 10000 },
        },
        {
          timestamp: new Date(Date.now() - 105000).toISOString(),
          level: 'info',
          message: 'Installing dependencies',
          context: { step: 'build' },
        },
        {
          timestamp: new Date(Date.now() - 85000).toISOString(),
          level: 'info',
          message: 'Running build scripts',
          context: { step: 'build' },
        },
        {
          timestamp: new Date(Date.now() - 60000).toISOString(),
          level: 'warn',
          message: 'Build warning: Unused variable "foo" in module "bar"',
          context: { step: 'build' },
        },
      ],
      total: 6,
      hasMore: false,
    };
  }

  async listCronJobs(): Promise<CronListResponse> {
    return {
      crons: [
        {
          id: 'daily-backup',
          schedule: '0 2 * * *',
          jobType: 'backup:database',
          timezone: 'UTC',
          enabled: true,
          lastRun: new Date(Date.now() - 86400000).toISOString(),
          nextRun: new Date(Date.now() + 86400000).toISOString(),
          pluginId: 'backup-plugin',
        },
        {
          id: 'hourly-sync',
          schedule: '0 * * * *',
          jobType: 'sync:data',
          timezone: 'UTC',
          enabled: true,
          lastRun: new Date(Date.now() - 3600000).toISOString(),
          nextRun: new Date(Date.now() + 600000).toISOString(),
          pluginId: 'sync-plugin',
        },
        {
          id: 'weekly-report',
          schedule: '0 9 * * 1',
          jobType: 'report:generate',
          timezone: 'America/New_York',
          enabled: false,
          pluginId: 'report-plugin',
        },
      ],
    };
  }

  async cancelWorkflowRun(runId: string): Promise<{ cancelled: boolean; runId: string }> {
    return { cancelled: true, runId };
  }

  async getWorkflowRuns(
    workflowId: string,
    _filters?: { limit?: number; offset?: number; status?: string },
  ): Promise<WorkflowRunHistoryResponse> {
    return {
      workflowId,
      runs: [
        {
          id: 'run-1',
          workflowId,
          status: 'completed',
          trigger: { type: 'manual', user: 'admin' },
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          finishedAt: new Date(Date.now() - 3420000).toISOString(),
          durationMs: 180000,
        },
        {
          id: 'run-2',
          workflowId,
          status: 'failed',
          trigger: { type: 'cron' },
          startedAt: new Date(Date.now() - 7200000).toISOString(),
          finishedAt: new Date(Date.now() - 7155000).toISOString(),
          durationMs: 45000,
          error: 'Step "deploy" failed: connection timeout',
        },
        {
          id: 'run-3',
          workflowId,
          status: 'completed',
          trigger: { type: 'api', user: 'ci-system' },
          startedAt: new Date(Date.now() - 86400000).toISOString(),
          finishedAt: new Date(Date.now() - 86220000).toISOString(),
          durationMs: 180000,
        },
      ],
      total: 3,
    };
  }
}


