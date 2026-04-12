/**
 * @module @kb-labs/workflow-cli/rest/workflow-detail-handler
 * REST handler for getting workflow definition details
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { WorkflowInfo } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client';

interface WorkflowDetailParams {
  id: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, unknown, WorkflowDetailParams>
  ): Promise<WorkflowInfo> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { id } = input.params!;

    if (!id) {
      throw new Error('Missing id parameter');
    }

    const url = `${daemonUrl}/api/v1/workflows/${encodeURIComponent(id)}`;
    ctx.platform.logger.info(`[workflow-detail-handler] Fetching workflow ${id} from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Workflow not found');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: WorkflowInfo; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch workflow');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[workflow-detail-handler] Error fetching workflow detail',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
