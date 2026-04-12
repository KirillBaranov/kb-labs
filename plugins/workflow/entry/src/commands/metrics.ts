/**
 * workflow:metrics command - Get workflow metrics
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { type MetricsFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type MetricsInput = MetricsFlags & { argv?: string[] };

export default defineCommand<unknown, MetricsInput, { exitCode: number }>({
  id: 'workflow:metrics',
  description: 'Get workflow daemon metrics',

  handler: {
    async execute(ctx: PluginContextV3, input: MetricsInput): Promise<{ exitCode: number }> {
      const flags = (input as any).flags ?? input;
      const outputJson = flags.json ?? false;

      try {
        const client = new WorkflowDaemonClient();
        const metrics = await client.getMetrics();

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: metrics });
        } else {
          const runsItems = [
            `Total: ${metrics.runs.total}`,
            `Queued: ${metrics.runs.queued}`,
            `Running: ${metrics.runs.running}`,
            `Completed: ${metrics.runs.completed}`,
            `Failed: ${metrics.runs.failed}`,
            `Cancelled: ${metrics.runs.cancelled}`,
          ];

          const jobsItems = [
            `Total: ${metrics.jobs.total}`,
            `Queued: ${metrics.jobs.queued}`,
            `Running: ${metrics.jobs.running}`,
            `Completed: ${metrics.jobs.completed}`,
            `Failed: ${metrics.jobs.failed}`,
          ];

          ctx.ui?.success?.('Workflow Metrics', {
            title: 'Workflow Daemon',
            sections: [
              { header: 'Runs', items: runsItems },
              { header: 'Jobs', items: jobsItems },
            ],
          });
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to get metrics: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }

        return { exitCode: 1 };
      }
    },
  },
});

