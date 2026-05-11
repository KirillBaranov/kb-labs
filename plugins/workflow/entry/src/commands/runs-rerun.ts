/**
 * workflow:runs-rerun <runId> command — like `gh run rerun`
 *
 * Reruns a workflow by re-submitting it with the same inputs and trigger.
 */

import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsRerunFlags {
  json?: boolean;
  'failed-only'?: boolean;
}

export default defineCommand<unknown, CLIInput<RunsRerunFlags>, { exitCode: number }>({
  id: 'workflow:runs-rerun',
  description: 'Rerun a workflow run',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RunsRerunFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const runId = argv[0];

      if (!runId) {
        ctx.ui?.error?.('Usage: kb workflow runs-rerun <runId> [--failed-only]');
        return { exitCode: 1 };
      }

      const outputJson = flags?.json ?? false;
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
        const message = error instanceof Error ? error.message : String(error);
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to rerun: ${message}`);
        }
        return { exitCode: 1 };
      }
    },
  },
});
