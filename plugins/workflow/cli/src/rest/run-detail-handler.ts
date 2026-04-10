/**
 * REST handler: GET /runs/:runId
 * Proxies to workflow daemon GET /api/v1/runs/:runId
 * Returns full workflow run data including jobs and steps.
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client.js';

interface RunDetailParams {
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
    input: RestInput<unknown, unknown, RunDetailParams>
  ): Promise<unknown> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params!;

    if (!runId) {
      throw new Error('Missing runId parameter');
    }

    const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}`;

    ctx.platform.logger.info(`[run-detail-handler] Fetching run ${runId} from ${url}`);

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
        throw new Error(result.error || 'Failed to fetch run');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[run-detail-handler] Error fetching run',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
