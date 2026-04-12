/**
 * @module @kb-labs/workflow-cli/rest/job-steps-handler
 * REST handler for job steps and progress (proxy to daemon)
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { JobStepsResponse } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client.js';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, unknown, { jobId: string }>
  ): Promise<JobStepsResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { jobId } = input.params!;

    const url = `${daemonUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/steps`;

    ctx.platform.logger.info(`[job-steps-handler] Fetching steps from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Job not found');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: JobStepsResponse; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch job steps');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[job-steps-handler] Error fetching job steps',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
