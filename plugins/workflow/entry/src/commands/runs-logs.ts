/**
 * workflow:runs-logs <runId> command — fetch logs for a workflow run
 */

import { defineCommand, validationError, handleError, type CLIInput, type PluginContextV3 , type CommandResult} from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';
import type { RunsLogsFlags } from '../flags.js';

type LogEntry = { level: string; message: string; timestamp: string; stepId?: string; stepName?: string; [key: string]: unknown };

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
    const label = log.stepName ?? log.stepId;
    const prefix = label ? `[${label}] ` : '';
    ctx.ui?.log?.({ level, message: `${prefix}${log.message}` });
  }
}

export default defineCommand<unknown, CLIInput<RunsLogsFlags>, unknown>({
  id: 'workflow:runs-logs',
  description: 'Fetch logs for a workflow run',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RunsLogsFlags>): Promise<CommandResult> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const runId = flags?.['run-id'] ?? argv[0];

      if (!runId) {
        validationError(ctx, 'Missing run ID', 'Usage: kb workflow runs logs <runId>', outputJson);
        return { ok: false, error: 'Command failed' };
      }

      try {
        const client = new WorkflowDaemonClient();
        const logs = await client.getRunLogs(runId, {
          stepId: flags?.step,
          failedOnly: flags?.['log-failed'],
        });
        renderLogs(ctx, logs as LogEntry[], outputJson);
        return { ok: true };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
