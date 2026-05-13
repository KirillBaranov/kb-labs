/**
 * workflow:logs command - Get job or run logs
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import { type LogsFlags } from '@kb-labs/workflow-contracts';
import { WorkflowDaemonClient } from '../http-client.js';

type LogsInput = LogsFlags & { argv?: string[]; flags?: LogsFlags };

type LogEntry = { level: string; message: string; timestamp: string; stepId?: string; [key: string]: unknown };

function renderLogs(ctx: PluginContextV3, logs: LogEntry[], outputJson: boolean): void {
  if (outputJson) {
    ctx.ui?.json?.({ ok: true, data: { logs } });
    return;
  }

  if (logs.length === 0) {
    ctx.ui?.warn?.('No logs found');
    return;
  }

  for (const log of logs) {
    const level = (log.level ?? 'info') as 'info' | 'warn' | 'error' | 'debug';
    const prefix = log.stepId ? `[${log.stepId}] ` : '';
    ctx.ui?.log?.({ level, message: `${prefix}${log.message}` });
  }
}

export default defineCommand<unknown, LogsInput, { exitCode: number }>({
  id: 'workflow:logs',
  description: 'Get logs for a workflow job or run',

  handler: {
    async execute(ctx: PluginContextV3, input: LogsInput): Promise<{ exitCode: number }> {
      const flags = input.flags ?? input;
      const outputJson = flags.json ?? false;
      const jobId = flags['job-id'];
      const runId = flags['run-id'];

      if (!jobId && !runId) {
        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: 'Missing required flag: --job-id or --run-id' });
        } else {
          ctx.ui?.error?.('Missing required flag: --job-id or --run-id');
          ctx.ui?.info?.('Usage: kb workflow logs --run-id=<run-id>');
        }
        return { exitCode: 1 };
      }

      try {
        const client = new WorkflowDaemonClient();

        if (runId) {
          const logs = await client.getRunLogs(runId);
          renderLogs(ctx, logs, outputJson);
        } else {
          const logs = await client.getJobLogs(jobId!);
          renderLogs(ctx, logs as LogEntry[], outputJson);
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (outputJson) {
          ctx.ui?.json?.({ ok: false, error: message });
        } else {
          ctx.ui?.error?.(`Failed to get logs: ${message}`);
        }

        return { exitCode: 1 };
      }
    },
  },
});
