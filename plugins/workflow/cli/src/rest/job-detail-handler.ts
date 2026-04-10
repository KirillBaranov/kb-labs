/**
 * REST handler: GET /workflows/jobs/:jobId
 * Proxies to workflow daemon GET /api/v1/jobs/:jobId
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client';

interface JobDetailParams {
  jobId: string;
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
  progress?: number;
  progressMessage?: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, unknown, JobDetailParams>
  ): Promise<JobStatusInfo> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params!;

    if (!jobId) {
      throw new Error('Missing jobId parameter');
    }

    const url = `${daemonUrl}/api/v1/jobs/${jobId}`;
    ctx.platform.logger.info(`[job-detail-handler] Fetching job ${jobId} from ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        ctx.platform.logger.error(`[job-detail-handler] Failed to fetch job: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || `Failed to fetch job ${jobId}`);
      }

      const payload = (await response.json()) as ApiEnvelope<JobStatusInfo>;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `Failed to fetch job ${jobId}`);
      }
      const data = payload.data;
      ctx.platform.logger.info(`[job-detail-handler] Fetched job ${jobId}, status: ${data.status}`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        '[job-detail-handler] Error fetching job detail',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
