/**
 * REST handler: GET /workflows/jobs
 * Proxies to workflow daemon GET /api/v1/jobs
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client';

interface JobsListQuery {
  type?: string;
  status?: string;
  limit?: string;
  offset?: string;
}

interface JobStatusInfo {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  tenantId?: string;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
}

interface JobListResponse {
  jobs: JobStatusInfo[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<JobsListQuery>
  ): Promise<JobListResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { type, status, limit, offset } = input.query || {};

    // Build query string
    const params = new URLSearchParams();
    if (type) {params.set('type', type);}
    if (status) {params.set('status', status);}
    if (limit) {params.set('limit', limit);}
    if (offset) {params.set('offset', offset);}

    const queryString = params.toString();
    const url = `${daemonUrl}/api/v1/jobs${queryString ? `?${queryString}` : ''}`;

    ctx.platform.logger.info(`[jobs-list-handler] Fetching jobs from ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        ctx.platform.logger.error(`[jobs-list-handler] Failed to fetch jobs: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || 'Failed to fetch jobs list');
      }

      const payload = (await response.json()) as ApiEnvelope<JobListResponse>;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || 'Failed to fetch jobs list');
      }
      const data = payload.data;
      ctx.platform.logger.info(`[jobs-list-handler] Fetched ${data.jobs.length} jobs`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        '[jobs-list-handler] Error fetching jobs list',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
