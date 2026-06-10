/**
 * workflow:runs-approve <runId> command — approve or reject a pending human-gate step
 *
 * When called without --job-id/--step-id, lists all pending approvals for the run
 * and auto-resolves the first one (or errors if there are none).
 * Use --job-id + --step-id to target a specific step by ID.
 * Use --action=reject to reject instead of approve (default is approve).
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { RunsApproveFlags } from '../flags.js';

export default defineCommand<unknown, CLIInput<RunsApproveFlags>, { exitCode: number }>({
  id: 'workflow:runs-approve',
  description: 'Approve or reject a pending approval step in a workflow run',

  handler: {
    async intent(_ctx: PluginContextV3, input: CLIInput<RunsApproveFlags>) {
      const runId = input.flags?.['run-id'] ?? input.argv?.[0];
      const action = input.flags?.action ?? 'approve';
      return {
        summary: `${action === 'reject' ? 'Reject' : 'Approve'} pending step in run ${runId ?? '(unknown)'}`,
        operations: [{ type: 'mutate' as const, resource: 'workflow-approval', details: { runId, action } }],
      };
    },

    async execute(ctx: PluginContextV3, input: CLIInput<RunsApproveFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];
      const action = (flags?.action ?? 'approve') as 'approve' | 'reject';
      const comment = flags?.comment;

      if (!runId) {
        validationError(
          ctx,
          'Missing run ID',
          'Usage: kb workflow runs approve <runId> [--action=approve|reject] [--comment=<text>]\n' +
            '       kb workflow runs approve <runId> --job-id=<jobId> --step-id=<stepId>',
          outputJson,
        );
        return { exitCode: 1 };
      }

      if (action !== 'approve' && action !== 'reject') {
        validationError(ctx, `Invalid action "${action}" — must be "approve" or "reject"`, '', outputJson);
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();

        // Explicit target: --job-id + --step-id supplied directly.
        let jobId = flags?.['job-id'];
        let stepId = flags?.['step-id'];
        let stepName: string | undefined;

        if (!jobId || !stepId) {
          // Discover pending approvals automatically.
          const { pending } = await client.listPendingApprovals(runId);

          if (pending.length === 0) {
            if (outputJson) {
              ctx.ui?.json?.({ ok: false, error: 'No pending approvals found for this run' });
            } else {
              ctx.ui?.error?.('No pending approvals', {
                title: runId,
                sections: [{ header: 'Details', items: ['No steps are currently waiting for approval.'] }],
              });
            }
            return { exitCode: 1 };
          }

          const first = pending[0];
          if (!first) {
            // Guard — cannot happen after the length===0 check above, but satisfies TS.
            ctx.ui?.error?.('No pending approvals', { title: runId, sections: [] });
            return { exitCode: 1 };
          }

          if (pending.length > 1) {
            // Multiple pending — require explicit targeting.
            if (outputJson) {
              ctx.ui?.json?.({ ok: false, error: 'Multiple pending approvals — specify --job-id and --step-id', pending });
            } else {
              const items = pending.map(
                (p, i) =>
                  `${i + 1}. [job:${p.jobId}] step "${p.stepName}" (${p.stepId})` +
                  (p.waitingSince ? ` — waiting since ${new Date(p.waitingSince).toLocaleString()}` : ''),
              );
              ctx.ui?.error?.('Multiple pending approvals', {
                title: runId,
                sections: [
                  {
                    header: 'Specify --job-id and --step-id to resolve one:',
                    items,
                  },
                  {
                    header: 'Example',
                    items: [
                      `kb workflow runs approve ${runId} --job-id=${first.jobId} --step-id=${first.stepId}`,
                    ],
                  },
                ],
              });
            }
            return { exitCode: 1 };
          }

          // Single pending — resolve it.
          jobId = first.jobId;
          stepId = first.stepId;
          stepName = first.stepName;
        }

        const result = await client.resolveApproval(runId, jobId, stepId, action, comment);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: result });
        } else {
          const actionLabel = action === 'approve' ? 'Approved' : 'Rejected';
          const icon = action === 'approve' ? '✓' : '✗';
          ctx.ui?.success?.(`${icon} ${actionLabel}`, {
            title: stepName ?? stepId,
            sections: [
              {
                header: 'Details',
                items: [
                  `Run:    ${runId}`,
                  `Job:    ${jobId}`,
                  `Step:   ${stepId}`,
                  `Action: ${action}`,
                  ...(comment ? [`Comment: ${comment}`] : []),
                  ``,
                  `Watch:  kb workflow runs watch ${runId}`,
                  `View:   kb workflow runs view ${runId}`,
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
