/**
 * workflow:runs-restart <runId> — restart a run from a specific step using a snapshot.
 *
 * All steps before --from-step inherit their stored outputs; only the target step
 * and those after it are re-executed. Omitting --from-step restarts from step 1
 * while still using the snapshot env.
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { RunsRestartFlags } from '../flags.js';

export default defineCommand<unknown, CLIInput<RunsRestartFlags>, { exitCode: number }>({
  id: 'workflow:runs-restart',
  description: 'Restart a run from a specific step, inheriting outputs of all preceding steps',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsRestartFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv[0];
      const fromStep = input.flags?.['from-step'];
      return {
        summary: `Restart workflow run ${runId ?? '(unknown)'}${fromStep ? ` from step "${fromStep}"` : ''}`,
        operations: [{ type: 'create' as const, resource: 'workflow-run', details: { sourceRunId: runId, fromStep } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<RunsRestartFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];

      if (!runId) {
        validationError(
          ctx,
          'Missing run ID',
          'Usage: kb workflow runs-restart <runId> [--from-step=<stepId>]',
          outputJson,
        );
        return { exitCode: 1 };
      }

      const fromStepId = flags?.['from-step'];

      try {
        const client = new WorkflowDaemonClient();
        const result = await client.restartRun(runId, { fromStepId });

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          ctx.ui?.success?.('Workflow Restart Triggered', {
            title: runId,
            sections: [
              {
                header: 'Details',
                items: [
                  `New run ID: ${result.runId}`,
                  `Status: ${result.status}`,
                  `Original run: ${runId}`,
                  ...(result.fromStepId ? [`Resuming from step: ${result.fromStepId}`] : ['Restarting from step 1']),
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
