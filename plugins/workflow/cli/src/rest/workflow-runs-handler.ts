/**
 * @module @kb-labs/workflow-cli/rest/workflow-runs-handler
 * REST handler for workflow run history (proxy to daemon)
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { WorkflowRunHistoryResponse } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client.js';

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<{ limit?: string; offset?: string; status?: string }, unknown, { id: string }>
  ): Promise<WorkflowRunHistoryResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { id: workflowId } = input.params!;
    const { limit, offset, status } = input.query || {};

    // Validate query parameters
    const validatedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000) : 50;
    const validatedOffset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const validStatuses = ['queued', 'running', 'completed', 'failed', 'cancelled'];
    const validatedStatus = status && validStatuses.includes(status) ? status : undefined;

    const params = new URLSearchParams();
    params.append('limit', String(validatedLimit));
    params.append('offset', String(validatedOffset));
    if (validatedStatus) {
      params.append('status', validatedStatus);
    }

    const url = `${daemonUrl}/api/v1/workflows/${encodeURIComponent(workflowId)}/runs?${params}`;

    ctx.platform.logger.info(`[workflow-runs-handler] Fetching run history from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Workflow not found');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: WorkflowRunHistoryResponse; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch workflow run history');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[workflow-runs-handler] Error fetching workflow run history',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
