/**
 * REST handler: GET /runs
 * Proxies to workflow daemon GET /api/v1/runs
 * Lists all workflow runs across all workflows.
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client.js';

interface RunsListQuery {
  status?: string;
  limit?: string;
  offset?: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<RunsListQuery>
  ): Promise<unknown> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { status, limit, offset } = input.query || {};

    const validatedLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 1000) : 50;
    const validatedOffset = offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0;
    const validStatuses = ['queued', 'running', 'success', 'failed', 'cancelled', 'dlq', 'skipped'];
    const validatedStatus = status && validStatuses.includes(status) ? status : undefined;

    const params = new URLSearchParams();
    params.append('limit', String(validatedLimit));
    params.append('offset', String(validatedOffset));
    if (validatedStatus) {
      params.append('status', validatedStatus);
    }

    const url = `${daemonUrl}/api/v1/runs?${params}`;

    ctx.platform.logger.info(`[runs-list-handler] Fetching runs from ${url}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as ApiEnvelope<unknown>;

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to fetch runs');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[runs-list-handler] Error fetching runs',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
