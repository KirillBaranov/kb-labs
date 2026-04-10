/**
 * REST handler: POST /runs/:runId/approve
 * Proxies to workflow daemon POST /api/v1/runs/:runId/approve
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import { getWorkflowDaemonUrl } from '../http-client.js';

interface ResolveApprovalParams {
  runId: string;
}

interface ResolveApprovalBody {
  jobId: string;
  stepId: string;
  action: 'approve' | 'reject';
  comment?: string;
  data?: Record<string, unknown>;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<unknown, ResolveApprovalBody, ResolveApprovalParams>
  ): Promise<unknown> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { runId } = input.params!;
    const body = input.body;

    if (!runId) {
      throw new Error('Missing runId parameter');
    }

    if (!body || !body.jobId || !body.stepId || !body.action) {
      throw new Error('Missing required fields: jobId, stepId, action');
    }

    const url = `${daemonUrl}/api/v1/runs/${encodeURIComponent(runId)}/approve`;

    ctx.platform.logger.info(`[resolve-approval-handler] Resolving approval for run ${runId}, step ${body.stepId}: ${body.action}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Run, job, or step not found');
        }
        if (response.status === 409) {
          const errResult = (await response.json()) as ApiEnvelope<unknown>;
          throw new Error(errResult.error || 'Step is not waiting for approval');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as ApiEnvelope<unknown>;

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to resolve approval');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[resolve-approval-handler] Error resolving approval',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
