/**
 * workflow:status command - Get job status
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { type StatusFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type StatusInput = StatusFlags & { argv?: string[] };

export default defineCommand<unknown, StatusInput, { exitCode: number }>({
  id: 'workflow:status',
  description: 'Get status of a workflow job',

  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Job status display with deep run/job/step traversal, multiple output formats (JSON/human), timing calculations, status color coding, and error aggregation
    async execute(ctx: PluginContextV3, input: StatusInput): Promise<{ exitCode: number }> {
      const flags = (input as { flags?: StatusFlags }).flags ?? input;
      const outputJson = flags.json ?? false;
      const jobId = flags['job-id'];

      if (!jobId) {
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: 'Missing required flag: --job-id' });
        } else {
          ctx.ui?.error?.('Missing required flag: --job-id');
          ctx.ui?.info?.('Usage: kb workflow status --job-id=<job-id>');
        }
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();
        const status = await client.getJobStatus(jobId);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: status });
        } else {
          const statusItems = [
            `ID: ${status.id}`,
            `Status: ${status.status}`,
            `Type: ${status.type || 'N/A'}`,
            `Started: ${status.startedAt || 'N/A'}`,
            `Finished: ${status.finishedAt || 'N/A'}`,
          ];

          // Add error if present
          if (status.error) {
            statusItems.push(`Error: ${status.error}`);
          }

          // Add result summary if present
          if (status.result?.summary) {
            statusItems.push(`Summary: ${status.result.summary}`);
          }

          const sections: Array<{ header: string; items: string[] }> = [
            { header: 'Details', items: statusItems },
          ];

          // Add jobs and steps details
          if (status.jobs && status.jobs.length > 0) {
            for (const job of status.jobs) {
              const jobItems = [
                `Status: ${job.status}`,
                `Duration: ${job.durationMs ? `${job.durationMs}ms` : 'N/A'}`,
              ];

              if (job.error) {
                jobItems.push(`Error: ${job.error}`);
              }

              sections.push({ header: `Job: ${job.name}`, items: jobItems });

              // Add steps for this job
              if (job.steps && job.steps.length > 0) {
                const stepItems: string[] = [];
                for (const step of job.steps) {
                  const statusIcon = step.status === 'success' ? '✓' : step.status === 'failed' ? '✗' : '○';
                  const duration = step.durationMs ? ` (${step.durationMs}ms)` : '';
                  stepItems.push(`${statusIcon} ${step.name}: ${step.status}${duration}`);

                  // Show outputs if present
                  if (step.outputs && Object.keys(step.outputs).length > 0) {
                    const outputStr = JSON.stringify(step.outputs, null, 2);
                    // Truncate long outputs
                    const truncated = outputStr.length > 500 ? outputStr.slice(0, 500) + '...' : outputStr;
                    stepItems.push(`  └─ Output: ${truncated}`);
                  }

                  // Show error if present
                  if (step.error) {
                    const errorMsg = typeof step.error === 'string' ? step.error : step.error?.message ?? String(step.error);
                    stepItems.push(`  └─ Error: ${errorMsg}`);
                  }
                }
                sections.push({ header: `  Steps (${job.steps.length})`, items: stepItems });
              }
            }
          }

          ctx.ui?.success?.('Job Status Retrieved', {
            title: 'Workflow Job',
            sections,
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to get job status: ${message}`);
        }

        return { exitCode: 1 };
      }
    },
  },
});

