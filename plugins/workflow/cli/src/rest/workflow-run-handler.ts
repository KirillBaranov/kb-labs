/**
 * @module @kb-labs/workflow-cli/rest/workflow-run-handler
 * REST handler for running a workflow
 */

import { defineHandler, type RestInput, type PluginContextV3 } from '@kb-labs/sdk';
import type { WorkflowRunRequest } from '@kb-labs/workflow-contracts';
import { getWorkflowDaemonUrl } from '../http-client';

interface WorkflowRunParams {
  id: string;
}

interface WorkflowRunResult {
  runId: string;
  status: string;
}

export default defineHandler({
  async execute(
    ctx: PluginContextV3,
    input: RestInput<WorkflowRunRequest, unknown, WorkflowRunParams>
  ): Promise<WorkflowRunResult> {
    const daemonUrl = getWorkflowDaemonUrl();
    const { id } = input.params!;

    if (!id) {
      throw new Error('Missing id parameter');
    }

    const body: WorkflowRunRequest = input.body || {};

    const url = `${daemonUrl}/api/v1/workflows/${encodeURIComponent(id)}/run`;
    ctx.platform.logger.info(`[workflow-run-handler] Running workflow ${id} via ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Workflow not found');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as { ok: boolean; data?: WorkflowRunResult; error?: string };

      if (!result.ok || !result.data) {
        throw new Error(result.error || 'Failed to run workflow');
      }

      return result.data;
    } catch (error) {
      ctx.platform.logger.error(
        '[workflow-run-handler] Error running workflow',
        error instanceof Error ? error : undefined
      );
      throw error;
    }
  },
});
