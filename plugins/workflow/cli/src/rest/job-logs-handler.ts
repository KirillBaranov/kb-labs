/**
 * @module @kb-labs/workflow-cli/rest/job-logs-handler
 * REST handler for job logs (proxy to daemon)
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { JobLogsResponse } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client.js';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<{ limit?: string; offset?: string; level?: string }, unknown, { jobId: string }>
  ): Promise<JobLogsResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params!;
    const { limit, offset, level } = input.query || {};

    // Validate query parameters
    const validatedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000) : 100;
    const validatedOffset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const validLevels = ['info', 'warn', 'error', 'debug', 'all'];
    const validatedLevel = level && validLevels.includes(level) ? level : 'all';

    const params = new URLSearchParams();
    params.append('limit', String(validatedLimit));
    params.append('offset', String(validatedOffset));
    params.append('level', validatedLevel);

    const url = `${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/logs?${params}`;

    ctx.platform.logger.info(`[job-logs-handler] Fetching logs from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: JobLogsResponse; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch job logs');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[job-logs-handler] Error fetching job logs',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
