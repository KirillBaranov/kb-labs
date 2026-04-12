/**
 * REST handler: POST /workflows/jobs/:jobId/cancel
 * Proxies to workflow daemon POST /api/v1/jobs/:jobId/cancel
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client';

interface JobCancelParams {
  jobId: string;
}

interface JobCancelResponse {
  cancelled: boolean;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, unknown, JobCancelParams>
  ): Promise<JobCancelResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params!;

    if (!jobId) {
      throw new Error('Missing jobId parameter');
    }

    const url = `${daemonUrl}/api/v1/jobs/${jobId}/cancel`;
    ctx.platform.logger.info(`[job-cancel-handler] Cancelling job ${jobId} at ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        ctx.platform.logger.error(`[job-cancel-handler] Failed to cancel job: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || `Failed to cancel job ${jobId}`);
      }

      const payload = (await response.json()) as ApiEnvelope<JobCancelResponse>;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `Failed to cancel job ${jobId}`);
      }
      const data = payload.data;
      ctx.platform.logger.info(`[job-cancel-handler] Job ${jobId} cancelled: ${data.cancelled}`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        '[job-cancel-handler] Error cancelling job',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
