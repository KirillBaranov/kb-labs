/**
 * workflow:runs-watch <runId> command — like `gh run watch`
 *
 * Streams run events in real-time via SSE endpoint.
 */

import { defineCommand, type CLIInput, type PluginContextV3 } from '@kb-labs/sdk';
import { WorkflowDaemonClient } from '../http-client.js';

interface RunsWatchFlags {
  json?: boolean;
}

const STATUS_ICON: Record<string, string> = {
  success: '✓',
  failed: '✗',
  running: '⠿',
  queued: '○',
  cancelled: '⊘',
  waiting_approval: '⏳',
};

export default defineCommand<unknown, CLIInput<RunsWatchFlags>, { exitCode: number }>({
  id: 'workflow:runs-watch',
  description: 'Stream workflow run events in real-time',

  handler: {
    async execute(ctx: PluginContextV3, input: CLIInput<RunsWatchFlags>): Promise<{ exitCode: number }> {
      const { flags, argv = [] } = input;
      const runId = argv[0];

      if (!runId) {
        ctx.ui?.error?.('Usage: kb workflow runs-watch <runId>');
        return { exitCode: 1 };
      }

      const outputJson = flags?.json ?? false;

      try {
        const client = new WorkflowDaemonClient();
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
              if (event.type === 'log.appended') {
                const p = event.payload as { level?: string; message?: string; stream?: string } | undefined;
                const lvl = p?.level === 'error' || p?.stream === 'stderr' ? 'ERR' : 'LOG';
                const step = event.stepId ? ` [${event.stepId}]` : '';
                ctx.ui?.info?.(`  ${lvl}${step} ${p?.message ?? ''}`);
                continue;
              }

              const icon = STATUS_ICON[(event.payload?.['status'] as string) ?? ''] ?? '·';
              const step = event.stepId ? ` step:${event.stepId}` : '';
              const job = event.jobId ? ` job:${event.jobId}` : '';
              const summary = event.payload?.['summary'] ?? event.payload?.['error'] ?? '';

              ctx.ui?.info?.(`${icon} ${event.type}${job}${step}${summary ? `  —  ${summary}` : ''}`);

              // Terminal events
              if (event.type === 'run.finished' || event.type === 'run.failed' || event.type === 'run.cancelled') {
                const finalStatus = event.payload?.['status'] as string ?? event.type.split('.')[1];
                ctx.ui?.info?.(`Run ${finalStatus.toUpperCase()}. Use 'kb workflow runs-view ${runId}' for details.`);
                return { exitCode: finalStatus === 'failed' ? 1 : 0 };
              }
            } catch {
              // Ignore malformed events
            }
          }
        }

        return { exitCode: 0 };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui?.error?.(`Failed to watch run: ${message}`);
        return { exitCode: 1 };
      }
    },
  },
});
