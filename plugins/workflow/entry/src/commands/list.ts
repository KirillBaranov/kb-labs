/**
 * workflow:list command - List active executions
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { type ListFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type ListInput = ListFlags & { argv?: string[]; flags?: ListFlags };

export default defineCommand<unknown, ListInput, { exitCode: number }>({
  id: 'workflow:list',
  description: 'List active workflow executions',

  handler: {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- Workflow listing with filtering (status/type), JSON/human output formats, run state formatting, and error handling
    async execute(ctx: PluginContextV3, input: ListInput): Promise<{ exitCode: number }> {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;
      const statusFilter = flags.status;
      const typeFilter = flags.type;

      try {
        const client = new WorkflowDaemonClient();

        // Handle --type cron filter
        if (typeFilter === 'cron') {
          const result = await client.getCronJobs();
          const cronJobs = result.crons ?? [];

          if (outputJson) {
            ctx.ui?.json?.({ ok: true, data: result });
          } else {
            if (cronJobs.length === 0) {
              ctx.ui?.warn?.('No cron jobs found');
              ctx.ui?.info?.('');
              ctx.ui?.info?.('To add cron jobs:');
              ctx.ui?.info?.('  1. Plugin manifests: Add "cron" section to manifest.ts');
              ctx.ui?.info?.('  2. User YAML: Create .kb/jobs/*.yml files');
            } else {
              // Build job details
              const jobItems = cronJobs.map(job => {
                const parts = [
                  `ID: ${job.id}`,
                  `Schedule: ${job.schedule} (${job.timezone || 'UTC'})`,
                  `Enabled: ${job.enabled ? 'Yes' : 'No'}`,
                  `Type: ${job.jobType || 'unknown'}`,
                ];
                return parts.join(' | ');
              });

              const summaryItems = [
                `Total Jobs: ${cronJobs.length}`,
              ];

              ctx.ui?.success?.('Cron Jobs', {
                title: 'Workflow Scheduler',
                sections: [
                  { header: 'Summary', items: summaryItems },
                  { header: 'Registered Jobs', items: jobItems },
                ],
              });
            }
          }

          return { exitCode: 0 };
        }

        // Default: list active executions (runs)
        let executions = await client.getExecutions();

        // Filter by status if provided
        if (statusFilter) {
          executions = executions.filter((exec) => exec.status === statusFilter);
        }

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: { executions } });
        } else {
          if (executions.length === 0) {
            ctx.ui?.warn?.('No active executions found');
          } else {
            const executionItems = executions.map(exec => {
              const parts = [
                `ID: ${exec.id}`,
                `Status: ${exec.status}`,
                `Started: ${exec.startedAt || 'N/A'}`,
              ];
              return parts.join(' | ');
            });

            const summaryItems = [
              `Total Executions: ${executions.length}`,
              statusFilter ? `Filter: ${statusFilter}` : undefined,
            ].filter(Boolean) as string[];

            ctx.ui?.success?.('Active Workflow Executions', {
              title: 'Workflow Engine',
              sections: [
                { header: 'Summary', items: summaryItems },
                { header: 'Executions', items: executionItems },
              ],
            });
          }
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to list: ${message}`);
          ctx.ui?.warn?.(`Make sure workflow daemon is running: kb-workflow`);
        }

        return { exitCode: 1 };
      }
    },
  },
});
