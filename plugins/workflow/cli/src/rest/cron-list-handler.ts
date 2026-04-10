/**
 * REST handler: GET /workflows/cron
 * Proxies to workflow daemon GET /api/v1/cron
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client';

interface CronInfo {
  id: string;
  schedule: string;
  jobType: string;
  timezone?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  pluginId?: string;
}

interface CronListResponse {
  crons: CronInfo[];
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    _input: RestInput
  ): Promise<CronListResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const url = `${daemonUrl}/api/v1/cron`;

    ctx.platform.logger.info(`[cron-list-handler] Fetching cron jobs from ${url}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        ctx.platform.logger.error(`[cron-list-handler] Failed to fetch cron jobs: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error || 'Failed to fetch cron jobs');
      }

      const payload = (await response.json()) as ApiEnvelope<CronListResponse>;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || 'Failed to fetch cron jobs');
      }
      const data = payload.data;
      ctx.platform.logger.info(`[cron-list-handler] Fetched ${data.crons.length} cron jobs`);
      return data;
    } catch (error) {
      ctx.platform.logger.error(
        '[cron-list-handler] Error fetching cron list',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
