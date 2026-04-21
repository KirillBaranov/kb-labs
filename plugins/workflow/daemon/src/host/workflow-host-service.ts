import type { ILogger } from '@kb-labs/core-platform';
import type { WorkflowEngine, WorkflowService } from '@kb-labs/workflow-engine';
import type {
  CronInfo,
  CronListResponse,
  CronRegistrationRequest,
  JobRun,
  JobCancelResponse,
  JobListFilter,
  JobListResponse,
  JobStatusInfo,
  JobSubmissionRequest,
  JobSubmissionResponse,
  StepRun,
  WorkflowInfo,
  WorkflowListResponse,
  WorkflowRun,
  WorkflowRunHistoryResponse,
  WorkflowRunRequest,
} from '@kb-labs/workflow-contracts';
import type { JobBroker } from '../job-broker.js';
import type { CronScheduler } from '../cron-scheduler.js';

const TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const CRON_SCHEDULER_NOT_AVAILABLE = 'Cron scheduler not available';

type JobStatus = JobStatusInfo['status'];

export interface WorkflowHostServiceOptions {
  engine: WorkflowEngine;
  jobBroker: JobBroker;
  logger: ILogger;
  workflowService?: WorkflowService;
  cronScheduler?: CronScheduler;
}

export type WorkflowEngineMetrics = Awaited<ReturnType<WorkflowEngine['getMetrics']>>;

export class WorkflowHostService {
  constructor(private readonly options: WorkflowHostServiceOptions) {}

  getHealth(): { ok: boolean; service: string } {
    return { ok: true, service: 'workflow-daemon' };
  }

  async getMetrics(): Promise<WorkflowEngineMetrics> {
    return this.options.engine.getMetrics();
  }

  async submitJob(
    tenantId: string,
    request: JobSubmissionRequest,
  ): Promise<JobSubmissionResponse> {
    this.assertTenantId(tenantId);
    if (!request.type) {
      throw new Error('Missing required field: type');
    }
    if (
      request.priority !== undefined
      && (request.priority < 1 || request.priority > 10)
    ) {
      throw new Error('Priority must be between 1 and 10');
    }

    const run = await this.options.jobBroker.submit({
      handler: request.type,
      input: request.payload,
      priority: mapPriority(request.priority ?? 5),
    });

    this.options.logger.info('Job submitted', {
      jobId: run.id,
      type: request.type,
      tenantId,
    });

    return { jobId: run.id };
  }

  async getJob(
    tenantId: string,
    jobId: string,
  ): Promise<JobStatusInfo & { jobs?: Array<Record<string, unknown>> }> {
    this.assertTenantId(tenantId);
    const run = (await this.options.engine.getRun(jobId)) as WorkflowRun | null;
    if (!run) {
      throw new Error('Job not found');
    }

    return {
      id: run.id,
      type: run.name,
      status: mapRunStatusToJobStatus(run.status),
      tenantId: run.tenantId ?? tenantId,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      result: run.result,
      error: run.result?.error?.message,
      jobs: run.jobs?.map((job: JobRun) => ({
        id: job.id,
        name: job.jobName,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        durationMs: job.durationMs,
        error: job.error?.message,
        steps: job.steps?.map((step: StepRun) => ({
          id: step.id,
          name: step.name,
          status: step.status,
          handler: step.spec?.uses,
          startedAt: step.startedAt,
          finishedAt: step.finishedAt,
          durationMs: step.durationMs,
          outputs: step.outputs,
          error: step.error,
        })),
      })),
    };
  }

  async getJobSteps(jobId: string): Promise<Array<Record<string, unknown>>> {
    const run = (await this.options.engine.getRun(jobId)) as WorkflowRun | null;
    if (!run) {
      throw new Error('Job not found');
    }
    return (
      run.jobs?.flatMap((job: JobRun) =>
        job.steps?.map((step: StepRun) => ({
          id: step.id,
          name: step.name,
          status: step.status,
          handler: step.spec?.uses,
          startedAt: step.startedAt,
          finishedAt: step.finishedAt,
          durationMs: step.durationMs,
          outputs: step.outputs,
          error: step.error,
          jobId: job.id,
          jobName: job.jobName,
        })) ?? []
      ) ?? []
    );
  }

  async getJobLogs(
    jobId: string,
    options?: { limit?: number; offset?: number; level?: string },
  ): Promise<Array<Record<string, unknown>>> {
    const logs = await this.options.jobBroker.getJobLogs(jobId, options);
    return logs as Array<Record<string, unknown>>;
  }

  async cancelJob(tenantId: string, jobId: string): Promise<JobCancelResponse> {
    await this.options.engine.cancelRun(jobId);
    this.options.logger.info('Job cancelled', { jobId, tenantId });
    return { cancelled: true };
  }

  async listJobs(
    tenantId: string,
    filter: JobListFilter,
  ): Promise<JobListResponse> {
    this.assertTenantId(tenantId);
    const { type, status, limit, offset } = filter;
    const allRuns = (await this.options.engine.getAllRuns()) as WorkflowRun[];

    let jobs: JobStatusInfo[] = allRuns.map((run: WorkflowRun) => ({
      id: run.id,
      type: run.name,
      status: mapRunStatusToJobStatus(run.status),
      tenantId: run.tenantId ?? tenantId,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      result: run.result,
      error: run.result?.error?.message,
    }));

    if (type) {
      const pattern = type.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      jobs = jobs.filter((job) => regex.test(job.type));
    }

    if (status) {
      jobs = jobs.filter((job) => job.status === status);
    }

    const start = offset ?? 0;
    const end = limit ? start + limit : jobs.length;

    return { jobs: jobs.slice(start, end) };
  }

  async listActiveExecutions(): Promise<Array<Record<string, unknown>>> {
    const runs = (await this.options.engine.getActiveExecutions()) as WorkflowRun[];
    return runs.map((run: WorkflowRun) => ({
      id: run.id,
      type: run.name,
      status: mapRunStatusToJobStatus(run.status),
      startedAt: run.startedAt,
      createdAt: run.createdAt,
    }));
  }

  async listWorkflows(options: {
    source?: 'manifest' | 'standalone';
    status?: 'active' | 'inactive';
    tags?: string;
  }): Promise<WorkflowListResponse> {
    const workflowService = this.requireWorkflowService();
    const workflows = await workflowService.listAll({
      source: options.source,
      status: options.status === 'inactive' ? 'disabled' : options.status,
      tags: options.tags ? options.tags.split(',') : undefined,
    });

    const response: WorkflowListResponse = {
      workflows: workflows.map((w: any) => this.mapWorkflowInfo(w)),
    };
    return response;
  }

  async getWorkflow(id: string): Promise<WorkflowInfo | null> {
    const workflowService = this.requireWorkflowService();
    const workflow = await workflowService.get(id);
    if (!workflow) {
      return null;
    }
    return this.mapWorkflowInfo(workflow);
  }

  async runWorkflow(
    id: string,
    request: WorkflowRunRequest,
  ): Promise<{ runId: string; status: string }> {
    const workflowService = this.requireWorkflowService();
    const workflow = await workflowService.get(id);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const specInput = workflow.input as Record<string, unknown>;
    const spec = {
      ...specInput,
      ...(request.target ? { target: request.target } : {}),
      ...(request.isolation ? { isolation: request.isolation } : {}),
    } as any;
    const triggerType =
      request.trigger?.type === 'cron'
        ? 'schedule'
        : request.trigger?.type === 'api'
          ? 'webhook'
          : 'manual';

    // Resolve inputs: merge spec defaults with user-supplied values.
    const specInputDefs = (specInput['inputs'] ?? {}) as Record<string, { default?: unknown }>;
    const userInputs = (request.input && typeof request.input === 'object')
      ? (request.input as Record<string, unknown>)
      : {};
    const resolvedInputs: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(specInputDefs)) {
      resolvedInputs[key] = key in userInputs ? userInputs[key] : def.default;
    }

    const run = await this.options.engine.runFromSpec(spec, {
      trigger: {
        type: triggerType,
        actor: request.trigger?.user,
        payload: userInputs,
      },
      inputs: resolvedInputs,
    });

    return {
      runId: run.id,
      status: run.status,
    };
  }

  registerCron(
    tenantId: string,
    request: CronRegistrationRequest,
  ): { ok: boolean } {
    this.assertTenantId(tenantId);
    const scheduler = this.requireCronScheduler();
    if (!request.id || !request.schedule || !request.jobType) {
      throw new Error('Missing required fields: id, schedule, jobType');
    }

    scheduler.register({
      id: request.id,
      source: 'user',
      schedule: request.schedule,
      timezone: request.timezone ?? 'UTC',
      priority: 'normal',
      enabled: request.enabled ?? true,
      handler: request.jobType,
      metadata: {
        tenantId,
        payload: request.payload,
      },
    });

    this.options.logger.info('Cron job registered', {
      id: request.id,
      schedule: request.schedule,
      jobType: request.jobType,
      tenantId,
    });

    return { ok: true };
  }

  unregisterCron(tenantId: string, id: string): { ok: boolean } {
    const scheduler = this.requireCronScheduler();
    scheduler.unregister(id);
    this.options.logger.info('Cron job unregistered', { id, tenantId });
    return { ok: true };
  }

  triggerCron(tenantId: string, id: string): Promise<{ ok: boolean }> {
    const scheduler = this.requireCronScheduler();
    return scheduler.triggerNow(id).then(() => {
      this.options.logger.info('Cron job triggered manually', { id, tenantId });
      return { ok: true };
    });
  }

  pauseCron(tenantId: string, id: string): { ok: boolean } {
    const scheduler = this.requireCronScheduler();
    scheduler.pause(id);
    this.options.logger.info('Cron job paused', { id, tenantId });
    return { ok: true };
  }

  resumeCron(tenantId: string, id: string): { ok: boolean } {
    const scheduler = this.requireCronScheduler();
    scheduler.resume(id);
    this.options.logger.info('Cron job resumed', { id, tenantId });
    return { ok: true };
  }

  listCron(): CronListResponse {
    const scheduler = this.requireCronScheduler();
    const crons: CronInfo[] = scheduler.getRegisteredJobs().map((job) => ({
      id: job.id,
      schedule: job.schedule,
      jobType: job.handler ?? 'unknown',
      timezone: job.timezone ?? 'UTC',
      enabled: job.enabled,
      lastRun: undefined,
      nextRun: scheduler.getNextRunTime(job.id) ?? undefined,
      pluginId: job.source === 'plugin' ? job.id.split(':')[1] : undefined,
    }));
    return { crons };
  }

  listLegacyCronJobs(): {
    cronJobs: Array<Record<string, unknown>>;
    total: number;
    running: boolean;
  } {
    const scheduler = this.requireCronScheduler();
    const cronJobs = scheduler.getRegisteredJobs();
    return {
      cronJobs: cronJobs.map((job) => ({
        id: job.id,
        source: job.source,
        schedule: job.schedule,
        timezone: job.timezone,
        priority: job.priority,
        enabled: job.enabled,
        handler: job.handler,
        workflowName: job.workflowSpec?.name,
        metadata: job.metadata,
      })),
      total: cronJobs.length,
      running: scheduler.isSchedulerRunning(),
    };
  }

  private assertTenantId(tenantId: string): void {
    if (!TENANT_ID_PATTERN.test(tenantId) || tenantId.length > 64) {
      throw new Error('Invalid tenant ID format or length (max 64 chars)');
    }
  }

  async listWorkflowRuns(
    workflowId: string,
    filters?: { limit?: number; offset?: number; status?: string },
  ): Promise<WorkflowRunHistoryResponse> {
    const allRuns = (await this.options.engine.getAllRuns()) as WorkflowRun[];

    // Try to resolve workflow name from id for matching
    let workflowName: string | undefined;
    if (this.options.workflowService) {
      const workflow = await this.options.workflowService.get(workflowId);
      workflowName = workflow?.name;
    }

    let runs = allRuns.filter((run) =>
      run.name === workflowId ||
      (workflowName && run.name === workflowName)
    );

    if (filters?.status) {
      runs = runs.filter((run) => run.status === filters.status);
    }

    // Sort newest first
    runs.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

    const start = filters?.offset ?? 0;
    const end = filters?.limit ? start + filters.limit : runs.length;
    const page = runs.slice(start, end);

    return {
      workflowId,
      runs: page.map((run) => ({
        id: run.id,
        workflowId,
        status: run.status as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
        trigger: {
          type: (run.trigger?.type as 'manual' | 'api' | 'cron') ?? 'manual',
          user: run.trigger?.actor,
        },
        startedAt: run.startedAt ?? run.createdAt ?? new Date().toISOString(),
        finishedAt: run.finishedAt,
        durationMs: run.durationMs,
        error: run.result?.error?.message,
      })),
      total: runs.length,
    };
  }

  private mapWorkflowInfo(workflow: any): WorkflowInfo {
    return {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      source: workflow.source,
      pluginId: workflow.pluginId,
      status: workflow.status === 'active' ? 'active' : 'inactive',
      tags: workflow.tags,
      inputs: workflow.inputSchema,
    };
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    return (await this.options.engine.getRun(runId)) as WorkflowRun | null;
  }

  async listRuns(filters?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: WorkflowRun[]; total: number }> {
    const allRuns = (await this.options.engine.getAllRuns()) as WorkflowRun[];

    let runs = allRuns;

    if (filters?.status) {
      runs = runs.filter((run) => run.status === filters.status);
    }

    // Sort newest first
    runs.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());

    const total = runs.length;
    const start = filters?.offset ?? 0;
    const end = filters?.limit ? start + filters.limit : runs.length;

    return { runs: runs.slice(start, end), total };
  }

  async cancelRun(runId: string): Promise<void> {
    const run = await this.options.engine.getRun(runId);
    if (!run) {
      throw new Error('Run not found');
    }
    if (run.status !== 'running' && run.status !== 'queued') {
      throw new Error(`Cannot cancel run with status "${run.status}"`);
    }
    await this.options.engine.cancelRun(runId);
  }

  private requireWorkflowService(): WorkflowService {
    if (!this.options.workflowService) {
      throw new Error('Workflow service not available');
    }
    return this.options.workflowService;
  }

  private requireCronScheduler(): CronScheduler {
    if (!this.options.cronScheduler) {
      throw new Error(CRON_SCHEDULER_NOT_AVAILABLE);
    }
    return this.options.cronScheduler;
  }
}

function mapRunStatusToJobStatus(
  status:
    | 'queued'
    | 'running'
    | 'success'
    | 'failed'
    | 'cancelled'
    | 'skipped'
    | 'dlq',
): JobStatus {
  switch (status) {
    case 'queued':
      return 'pending';
    case 'running':
      return 'running';
    case 'success':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'skipped':
      return 'cancelled';
    case 'dlq':
      return 'failed';
  }
}

function mapPriority(priority: number): 'low' | 'normal' | 'high' {
  if (priority <= 3) {
    return 'low';
  }
  if (priority <= 7) {
    return 'normal';
  }
  return 'high';
}
