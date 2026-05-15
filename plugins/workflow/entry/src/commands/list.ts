/**
 * workflow:list command - List active executions
 */

import { defineCommand, handleError, type PluginContextV3 } from '@kb-labs/sdk';
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
                ctx.ui?.table?.(
                cronJobs.map(job => ({
                  id: job.id,
                  schedule: `${job.schedule} (${job.timezone || 'UTC'})`,
                  enabled: job.enabled ? 'yes' : 'no',
                  type: job.jobType || 'unknown',
                })),
                [
                  { header: 'ID', key: 'id' },
                  { header: 'Schedule', key: 'schedule' },
                  { header: 'Enabled', key: 'enabled' },
                  { header: 'Type', key: 'type' },
                ],
              );
              ctx.ui?.success?.(`${cronJobs.length} cron job${cronJobs.length === 1 ? '' : 's'}`);
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
            ctx.ui?.table?.(
              executions.map(exec => ({
                id: exec.id,
                status: exec.status,
                started: exec.startedAt || 'N/A',
              })),
              [
                { header: 'ID', key: 'id' },
                { header: 'Status', key: 'status' },
                { header: 'Started', key: 'started' },
              ],
            );
            const filterNote = statusFilter ? ` (filter: ${statusFilter})` : '';
            ctx.ui?.success?.(`${executions.length} execution${executions.length === 1 ? '' : 's'}${filterNote}`);
          }
        }

        return { exitCode: 0 };
      } catch (error) {
        handleError(ctx, error, outputJson);
        if (!outputJson) ctx.ui?.warn?.('Make sure workflow daemon is running: kb-workflow');
        return { exitCode: 1 };
      }
    },
  },
});
