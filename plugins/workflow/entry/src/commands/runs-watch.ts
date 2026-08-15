/**
 * workflow:runs-watch <runId> command — like `gh run watch`
 *
 * Streams run events in real-time via SSE endpoint.
 */

import { defineCommand, handleError, type CLIInput, type PluginContextV3 , type CommandResult} from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsWatchFlags {
  'run-id'?: string;
  json?: boolean;
  logs?: boolean;
}

const STATUS_ICON: Record<string, string> = {
  success: '✓',
  failed: '✗',
  running: '⠿',
  queued: '○',
  cancelled: '⊘',
  waiting_approval: '⏳',
  waiting_child: '⏳',
  interrupted: '‖',
};

export default defineCommand<unknown, CLIInput<RunsWatchFlags>, unknown>({
  id: 'workflow:runs-watch',
  description: 'Stream workflow run events in real-time',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RunsWatchFlags>): Promise<CommandResult> {
      const { flags, argv = [] } = input;
      const outputJson = flags?.json ?? false;
      const logsOnly = flags?.logs ?? false;
      let runId = flags?.['run-id'] ?? argv[0];

      try {
        const client = new WorkflowDaemonClient();

        // No run ID supplied — watch the latest run (like `gh run watch`)
        if (!runId) {
          const latest = await client.listRuns({ limit: 1 });
          if (!latest.length) {
            ctx.ui?.info?.('No runs found');
            return { ok: true };
          }
          runId = latest[0]!.id!;
          ctx.ui?.info?.(`Watching latest run: ${runId}`);
        }

        const eventsUrl = client.getRunEventsUrl(runId);

        ctx.ui?.info?.(`Watching run ${runId} (Ctrl+C to stop)...`);

        // Use fetch with streaming to consume SSE
        const response = await fetch(eventsUrl, {
          headers: { Accept: 'text/event-stream' },
        });

        if (!response.ok || !response.body) {
          throw new Error(`Failed to connect to events stream: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) { continue; }
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') { continue; }

            try {
              const event = JSON.parse(raw) as { type: string; runId?: string; jobId?: string; stepId?: string; payload?: Record<string, unknown> };

              if (outputJson) {
                ctx.ui?.json?.({ event });
                continue;
              }

              // Stream log lines from handler (ctx.logger.* / ctx.ui.* / console.log)
              // Rendered as compact single lines, not boxes.
              // See: plugins/workflow/docs/adr/0019-log-stream-separation.md
              if (event.type === 'log.appended') {
                const p = event.payload as { level?: string; message?: string; stepName?: string } | undefined;
                const label = p?.stepName ?? (event.stepId ? event.stepId.slice(0, 8) : '');
                const prefix = label ? `[${label}] ` : '';
                ctx.ui?.log?.({
                  level: (p?.level ?? 'info') as 'info' | 'warn' | 'error' | 'debug',
                  message: `${prefix}${p?.message ?? ''}`,
                });
                continue;
              }

              // --logs: suppress non-log events
              if (logsOnly) { continue; }

              const icon = STATUS_ICON[(event.payload?.['status'] as string) ?? ''] ?? '·';
              const step = event.stepId ? ` step:${event.stepId.slice(0, 8)}` : '';
              const job = event.jobId ? ` job:${event.jobId.slice(0, 8)}` : '';
              const summary = event.payload?.['summary'] ?? event.payload?.['error'] ?? '';

              ctx.ui?.write?.(`${icon} ${event.type}${job}${step}${summary ? `  —  ${summary}` : ''}`);

              // Terminal events
              if (event.type === 'run.finished' || event.type === 'run.failed' || event.type === 'run.cancelled') {
                const finalStatus = event.payload?.['status'] as string ?? event.type.split('.')[1];
                ctx.ui?.write?.(`Run ${finalStatus.toUpperCase()}. Use 'kb workflow runs-view ${runId}' for details.`);
                return finalStatus === 'failed'
                  ? { ok: false, error: 'Workflow run failed' }
                  : { ok: true };
              }
            } catch {
              // Ignore malformed events
            }
          }
        }

        return { ok: true };
      } catch (error) {
        handleError(ctx, error, outputJson);
        return { ok: false, error: 'Command failed' };
      }
    },
  },
});
