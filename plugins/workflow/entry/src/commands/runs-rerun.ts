/**
 * workflow:runs-rerun <runId> command — like `gh run rerun`
 *
 * Reruns a workflow by re-submitting it with the same inputs and trigger.
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsRerunFlags {
  'run-id'?: string;
  json?: boolean;
  'failed-only'?: boolean;
  'dry-run'?: boolean;
}

export default defineCommand<unknown, CLIInput<RunsRerunFlags>, { exitCode: number }>({
  id: 'workflow:runs-rerun',
  description: 'Rerun a workflow run',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsRerunFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv[0];
      const failedOnly = input.flags?.['failed-only'];
      return {
        summary: `Rerun workflow run ${runId ?? '(unknown)'}${failedOnly ? ' (failed jobs only)' : ''}`,
        operations: [{ type: 'create' as const, resource: 'workflow-run', details: { sourceRunId: runId, failedOnly } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<RunsRerunFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];

      if (!runId) {
        validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs-rerun <runId> [--run-id=<id>] [--failed-only]', outputJson);
        return { exitCode: 1 };
      }
      const failedOnly = flags?.['failed-only'] ?? false;

      try {
        const client = new WorkflowDaemonClient();

        // Get original run to extract workflow ID and inputs
        const run = await client.getRun(runId);
        const workflowId = (run.metadata as Record<string, unknown> | undefined)?.['workflowId'] as string | undefined
          ?? run.name;

        if (!workflowId) {
          throw new Error('Cannot determine workflow ID from run metadata');
        }

        if (failedOnly) {
          ctx.ui?.info?.(`Note: --failed-only is not yet supported by the daemon. Rerunning entire workflow.`);
        }

        // Rerun by submitting the same workflow with the same inputs
        const result = await client.runWorkflow(workflowId, {
          inputs: run.inputs as Record<string, unknown> | undefined,
          trigger: {
            type: 'manual',
            user: 'cli-rerun',
          },
        });

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          ctx.ui?.success?.('Workflow Rerun Triggered', {
            title: workflowId,
            sections: [
              {
                header: 'Details',
                items: [
                  `New run ID: ${result.runId}`,
                  `Status: ${result.status}`,
                  `Original run: ${runId}`,
                  ``,
                  `Watch: kb workflow runs-watch ${result.runId}`,
                  `View:  kb workflow runs-view ${result.runId}`,
                ],
              },
            ],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { exitCode: 1 };
      }
    },
  },
});
