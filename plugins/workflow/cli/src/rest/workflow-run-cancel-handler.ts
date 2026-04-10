/**
 * REST handler: POST /workflows/runs/:runId/cancel
 * Proxies to workflow daemon POST /api/v1/workflows/runs/:runId/cancel
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client';

interface RunCancelParams {
  runId: string;
}

interface RunCancelResponse {
  cancelled: boolean;
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
    input: RestInput<unknown, unknown, RunCancelParams>
  ): Promise<RunCancelResponse> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params!;

    if (!runId) {
      throw new Error('Missing runId parameter');
    }

    const url = `${daemonUrl}/api/v1/workflows/runs/${encodeURIComponent(runId)}/cancel`;
    ctx.platform.logger.info(`[workflow-run-cancel-handler] Cancelling run ${runId} at ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new Error(errorData.error || `Failed to cancel run ${runId}`);
      }

      const payload = (await response.json()) as ApiEnvelope<RunCancelResponse>;
      if (!payload.ok || !payload.data) {
        throw new Error(payload.error || `Failed to cancel run ${runId}`);
      }
      return payload.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[workflow-run-cancel-handler] Error cancelling run',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
