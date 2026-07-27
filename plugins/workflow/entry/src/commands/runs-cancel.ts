/**
 * workflow:runs-cancel <runId> command — cancel an active workflow run
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 , type CommandResult} from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { RunsCancelFlags } from '../flags.js';

export default defineCommand<unknown, CLIInput<RunsCancelFlags>, unknown>({
  id: 'workflow:runs-cancel',
  description: 'Cancel a workflow run',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsCancelFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv[0];
      return {
        summary: `Cancel workflow run ${runId ?? '(unknown)'}`,
        operations: [{ type: 'delete' as const, resource: 'workflow-run', details: { runId } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<RunsCancelFlags>): Promise<CommandResult> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];

      if (!runId) {
        validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs cancel <runId> [--run-id=<id>]', outputJson);
        return { ok: false, error: 'Command failed' };
      }

      try {
        const client = new WorkflowDaemonClient();
        await client.cancelRun(runId);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: { runId, cancelled: true } });
        } else {
          ctx.ui?.success?.('Cancellation Requested', {
            title: runId,
            sections: [
              {
                header: 'Details',
                items: [
                  `Run ID: ${runId}`,
                  `Status: cancellation requested`,
                  ``,
                  `View: kb workflow runs view ${runId}`,
                ],
              },
            ],
          });
        }

        return { ok: true };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
