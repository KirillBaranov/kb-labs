/**
 * @module @kb-labs/workflow-cli/rest/stats-handler
 * REST handler for dashboard statistics (proxy to daemon)
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { DashboardStatsResponse } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client';

export default defineHandler({
  async execute(ctx: PluginContextV3, _input: RestInput<unknown>): Promise<DashboardStatsResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const url = `${daemonUrl}/api/v1/stats`;

    ctx.platform.logger.info(`[stats-handler] Fetching stats from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: DashboardStatsResponse; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch stats');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[stats-handler] Error fetching stats',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
