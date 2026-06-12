/**
 * workflow:runs-resume <runId> --from-step <stepId>
 *
 * Resumes a failed workflow run from a specific step, inheriting all outputs
 * from steps that completed before the target step.
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsResumeFlags {
  'run-id'?: string;
  'from-step'?: string;
  'job-id'?: string;
  json?: boolean;
}

export default defineCommand<unknown, CLIInput<RunsResumeFlags>, { exitCode: number }>({
  id: 'workflow:runs-resume',
  description: 'Resume a failed workflow run from a specific step',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsResumeFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv[0];
      const fromStep = input.flags?.['from-step'];
      return {
        summary: `Resume run ${runId ?? '(unknown)'} from step '${fromStep ?? '(unknown)'}'`,
        operations: [{ type: 'mutate' as const, resource: 'workflow-run', details: { runId, fromStep } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<RunsResumeFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];
      const fromStep = flags?.['from-step'];
      const jobId = flags?.['job-id'];

      if (!runId) {
        validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs resume <runId> --from-step <stepId>', outputJson);
        return { exitCode: 1 };
      }

      if (!fromStep) {
        validationError(ctx, 'Missing --from-step flag', 'Usage: kb workflow runs resume <runId> --from-step <stepId>', outputJson);
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();
        const result = await client.resumeRun(runId, { fromStepId: fromStep, jobId });

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          ctx.ui?.success?.('Workflow Run Resumed', {
            title: runId,
            sections: [
              {
                header: 'Details',
                items: [
                  `Run ID: ${result.runId}`,
                  `Status: ${result.status}`,
                  `Resuming from step: ${fromStep}`,
                  ...(jobId ? [`Job: ${jobId}`] : []),
                  ``,
                  `Watch: kb workflow runs watch ${result.runId}`,
                  `View:  kb workflow runs view ${result.runId}`,
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
