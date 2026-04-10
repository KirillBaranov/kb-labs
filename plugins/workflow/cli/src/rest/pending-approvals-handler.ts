/**
 * REST handler: GET /runs/:runId/pending-approvals
 * Proxies to workflow daemon GET /api/v1/runs/:runId/pending-approvals
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client.js';

interface PendingApprovalsParams {
  runId: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, unknown, PendingApprovalsParams>
  ): Promise<unknown> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params!;

    if (!runId) {
      throw new Error('Missing runId parameter');
    }

    const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}/pending-approvals`;

    ctx.platform.logger.info(`[pending-approvals-handler] Fetching pending approvals for run ${runId}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Run not found');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as ApiEnvelope<unknown>;

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch pending approvals');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[pending-approvals-handler] Error fetching pending approvals',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
