import type { HttpClient } from '../client/http-client'
import { KBError } from '../errors/kb-error'
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
  PendingApprovalsResponse,
  ResolveApprovalParams,
} from './workflow-source'
import type {
  WorkflowRun,
  WorkflowRunsListResponse,
  WorkflowPresenterEvent,
} from '../contracts/workflows'

function buildQuery(params?: WorkflowRunsFilters): string {
  if (!params || Object.keys(params).length === 0) {
    return ''
  }
  const query = new URLSearchParams()
  if (params.status) {
    query.set('status', params.status)
  }
  if (typeof params.limit === 'number' && !Number.isNaN(params.limit)) {
    query.set('limit', String(params.limit))
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

// No longer needed with axios (handles JSON automatically)

export class HttpWorkflowSource implements WorkflowDataSource {
  constructor(private readonly client: HttpClient) {}

  async listRuns(filters?: WorkflowRunsFilters): Promise<WorkflowRunsListResponse> {
    const query = buildQuery(filters)
    return this.client.fetch<WorkflowRunsListResponse>(`/plugins/workflow/runs${query}`)
  }

  async getRun(runId: string): Promise<WorkflowRun | null> {
    try {
      const response = await this.client.fetch<{ run: WorkflowRun }>(
        `/plugins/workflow/runs/${encodeURIComponent(runId)}`,
      )
      return response.run
    } catch (error) {
      if (error instanceof KBError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async cancelRun(runId: string): Promise<WorkflowRun> {
    await this.client.fetch<{ cancelled: boolean; runId: string }>(
      `/plugins/workflow/workflows/runs/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' },
    )
    // Fetch the updated run after cancel
    const run = await this.getRun(runId)
    if (!run) {
      return { id: runId, status: 'cancelled' } as WorkflowRun
    }
    return run
  }

  async runWorkflow(params: WorkflowRunParams): Promise<WorkflowRun> {
    const response = await this.client.fetch<{ run: WorkflowRun }>(
      `/plugins/workflow/workflows/${encodeURIComponent(params.spec.name)}/run`,
      {
        method: 'POST',
        data: {
          input: params.metadata,
        },
      },
    )
    return response.run
  }

  async listEvents(
    runId: string,
    options: { cursor?: string | null; limit?: number } = {},
  ): Promise<{ events: WorkflowPresenterEvent[]; cursor: string | null }> {
    const params = new URLSearchParams()
    if (options.cursor) {
      params.set('cursor', options.cursor)
    }
    if (typeof options.limit === 'number' && !Number.isNaN(options.limit)) {
      params.set('limit', String(options.limit))
    }
    const query = params.toString()
    return this.client.fetch<{ events: WorkflowPresenterEvent[]; cursor: string | null }>(
      `/workflows/runs/${runId}/events${query ? `?${query}` : ''}`,
    )
  }

  // 🆕 NEW methods for UI

  async getStats(): Promise<DashboardStatsResponse> {
    return this.client.fetch<DashboardStatsResponse>('/plugins/workflow/stats')
  }

  async listWorkflows(filters?: { limit?: number }): Promise<WorkflowListResponse> {
    const params = new URLSearchParams()
    if (typeof filters?.limit === 'number' && !Number.isNaN(filters.limit)) {
      params.set('limit', String(filters.limit))
    }
    const query = params.toString()
    return this.client.fetch<WorkflowListResponse>(
      `/plugins/workflow/workflows${query ? `?${query}` : ''}`,
    )
  }

  async getWorkflow(workflowId: string): Promise<WorkflowInfo | null> {
    try {
      return await this.client.fetch<WorkflowInfo>(
        `/plugins/workflow/workflows/${encodeURIComponent(workflowId)}`,
      )
    } catch (error) {
      if (error instanceof KBError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async runWorkflowById(
    workflowId: string,
    input?: Record<string, unknown>,
  ): Promise<{ runId: string; status: string }> {
    return this.client.fetch<{ runId: string; status: string }>(
      `/plugins/workflow/workflows/${encodeURIComponent(workflowId)}/run`,
      {
        method: 'POST',
        data: { input },
      },
    )
  }

  async listJobs(filters?: JobListFilter): Promise<JobListResponse> {
    const params = new URLSearchParams()
    if (filters?.type) {
      params.set('type', filters.type)
    }
    if (filters?.status) {
      params.set('status', filters.status)
    }
    if (typeof filters?.limit === 'number' && !Number.isNaN(filters.limit)) {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number' && !Number.isNaN(filters.offset)) {
      params.set('offset', String(filters.offset))
    }
    const query = params.toString()
    return this.client.fetch<JobListResponse>(
      `/plugins/workflow/jobs${query ? `?${query}` : ''}`,
    )
  }

  async getJob(jobId: string): Promise<JobStatusInfo | null> {
    try {
      return await this.client.fetch<JobStatusInfo>(
        `/plugins/workflow/jobs/${encodeURIComponent(jobId)}`,
      )
    } catch (error) {
      if (error instanceof KBError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  async getJobSteps(jobId: string): Promise<JobStepsResponse> {
    return this.client.fetch<JobStepsResponse>(
      `/plugins/workflow/jobs/${encodeURIComponent(jobId)}/steps`,
    )
  }

  async getJobLogs(
    jobId: string,
    filters?: { limit?: number; offset?: number; level?: string },
  ): Promise<JobLogsResponse> {
    const params = new URLSearchParams()
    if (typeof filters?.limit === 'number' && !Number.isNaN(filters.limit)) {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number' && !Number.isNaN(filters.offset)) {
      params.set('offset', String(filters.offset))
    }
    if (filters?.level) {
      params.set('level', filters.level)
    }
    const query = params.toString()
    return this.client.fetch<JobLogsResponse>(
      `/plugins/workflow/jobs/${encodeURIComponent(jobId)}/logs${query ? `?${query}` : ''}`,
    )
  }

  async listCronJobs(): Promise<CronListResponse> {
    return this.client.fetch<CronListResponse>('/plugins/workflow/cron')
  }

  async getPendingApprovals(runId: string): Promise<PendingApprovalsResponse> {
    return this.client.fetch<PendingApprovalsResponse>(
      `/plugins/workflow/runs/${encodeURIComponent(runId)}/pending-approvals`,
    )
  }

  async resolveApproval(params: ResolveApprovalParams): Promise<{ resolved: boolean }> {
    const { runId, ...body } = params
    return this.client.fetch<{ resolved: boolean }>(
      `/plugins/workflow/runs/${encodeURIComponent(runId)}/approve`,
      {
        method: 'POST',
        data: body,
      },
    )
  }

  async cancelWorkflowRun(runId: string): Promise<{ cancelled: boolean; runId: string }> {
    return this.client.fetch<{ cancelled: boolean; runId: string }>(
      `/plugins/workflow/workflows/runs/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' },
    )
  }

  async getWorkflowRuns(
    workflowId: string,
    filters?: { limit?: number; offset?: number; status?: string },
  ): Promise<WorkflowRunHistoryResponse> {
    const params = new URLSearchParams()
    if (typeof filters?.limit === 'number' && !Number.isNaN(filters.limit)) {
      params.set('limit', String(filters.limit))
    }
    if (typeof filters?.offset === 'number' && !Number.isNaN(filters.offset)) {
      params.set('offset', String(filters.offset))
    }
    if (filters?.status) {
      params.set('status', filters.status)
    }
    const query = params.toString()
    return this.client.fetch<WorkflowRunHistoryResponse>(
      `/plugins/workflow/workflows/${encodeURIComponent(workflowId)}/runs${query ? `?${query}` : ''}`,
    )
  }
}
