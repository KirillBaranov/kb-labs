/**
 * workflow:logs command - Get job logs
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { type LogsFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type LogsInput = LogsFlags & { argv?: string[] };

export default defineCommand<unknown, LogsInput, { exitCode: number }>({
  id: 'workflow:logs',
  description: 'Get logs for a workflow job',

  handler: {
    async execute(ctx: PluginContextV3, input: LogsInput): Promise<{ exitCode: number }> {
      const flags = (input as any).flags ?? input;
      const outputJson = flags.json ?? false;
      const jobId = flags['job-id'];

      if (!jobId) {
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: 'Missing required flag: --job-id' });
        } else {
          ctx.ui?.error?.('Missing required flag: --job-id');
          ctx.ui?.info?.('Usage: kb workflow logs --job-id=<job-id>');
        }
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();
        const logs = await client.getJobLogs(jobId);

        if (outputJson) {
          ctx.ui?.json?.({ ok: true, data: { logs } });
        } else {
          if (logs.length === 0) {
            ctx.ui?.warn?.('No logs available (platform.logger integration pending)');
          } else {
            const logItems = logs.map(log => {
              const level = log.level?.toUpperCase() || 'INFO';
              return `[${level}] ${log.message}`;
            });

            ctx.ui?.success?.('Job Logs Retrieved', {
              title: 'Workflow Job',
              sections: [
                { header: 'Job ID', items: [jobId] },
                { header: 'Logs', items: logItems },
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
          ctx.ui?.error?.(`Failed to get job logs: ${message}`);
        }

        return { exitCode: 1 };
      }
    },
  },
});

