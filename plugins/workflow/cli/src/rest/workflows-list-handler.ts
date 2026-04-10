/**
 * @module @kb-labs/workflow-cli/rest/workflows-list-handler
 * REST handler for listing workflow definitions
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { WorkflowListResponse } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client';

interface WorkflowsListQuery {
  source?: string;
  status?: string;
  tags?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<WorkflowsListQuery>
  ): Promise<WorkflowListResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { source, status, tags } = input.query || {};

    const params = new URLSearchParams();
    if (source) {params.append('source', source);}
    if (status) {params.append('status', status);}
    if (tags) {params.append('tags', tags);}

    const queryString = params.toString();
    const url = `${daemonUrl}/api/v1/workflows${queryString ? `?${queryString}` : ''}`;

    ctx.platform.logger.info(`[workflows-list-handler] Fetching workflows from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: WorkflowListResponse; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch workflows');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[workflows-list-handler] Error fetching workflows',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
