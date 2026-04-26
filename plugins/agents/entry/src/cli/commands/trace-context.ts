/**
 * agent:trace:context - View what LLM sees at each iteration
 *
 * Shows the full context timeline: what messages are in the sliding window,
 * what was truncated, what was dropped, and what the LLM responded.
 *
 * Usage:
 *   pnpm kb agent trace context --task-id=<id>
 *   pnpm kb agent trace context --task-id=<id> --iteration=3
 *   pnpm kb agent trace context --task-id=<id> --json
 */

import { defineCommand, type PluginContextV3 } from '@kb-labs/sdk';
import type { TraceCommandResponse, TraceErrorCode } from '@kb-labs/agent-contracts';
import { loadTrace, formatTraceLoadError } from '@kb-labs/agent-tracing';

type TraceContextFlags = {
  taskId?: string;
  'task-id'?: string;
  iteration?: number | string;
  json?: boolean;
};

type TraceContextInput = TraceContextFlags & {
  flags?: TraceContextFlags;
};


type ContextMessage = {
  index: number;
  role: string;
  chars: number;
  truncated?: boolean;
  toolCalls?: string[];
  toolCallId?: string;
  preview?: string;
};

type ContextSnapshot = {
  iteration: number;
  tier: string;
  messageCount: number;
  totalChars: number;
  estimatedTokens: number;
  toolCount: number;
  slidingWindow?: {
    fullHistorySize: number;
    windowedSize: number;
    droppedMessages: number;
  };
  messages: ContextMessage[];
};

type LLMResponseInfo = {
  content: string;
  hasToolCalls: boolean;
  toolCallsCount: number;
  toolCalls?: Array<{ name: string; args: string }>;
};

type IterationContext = {
  iteration: number;
  context: ContextSnapshot;
  response: LLMResponseInfo | null;
  tokensUsed: number;
  durationMs: number;
};

export default defineCommand({
  id: 'trace:context',
  description: 'View what the LLM sees at each iteration — context window, truncations, and responses',

  handler: {
    async execute(ctx: PluginContextV3, input: TraceContextInput): Promise<{ exitCode: number }> {
      const flags: TraceContextFlags = input.flags ?? input;
      const taskId = (flags['task-id'] ?? flags.taskId) as string | undefined;
      const filterIteration = typeof flags.iteration === 'string'
        ? parseInt(flags.iteration, 10)
        : (flags.iteration as number | undefined);

      try {
        const loaded = await loadTrace(taskId);
        if (!loaded.ok) {
          ctx.ui.write(JSON.stringify(error('INVALID_TASK_ID', formatTraceLoadError(loaded.error)), null, 2) + '\n');
          return { exitCode: 1 };
        }
        const events = loaded.events;

        // Collect context snapshots and LLM responses
        const iterations: IterationContext[] = [];
        let currentSnapshot: ContextSnapshot | null = null;

        type AnyEvent = { type: string; timestamp: string; data?: unknown };
        for (const e of events as unknown as AnyEvent[]) {
          if (e.type === 'context:snapshot') {
            // Fields are at top level (IncrementalTraceWriter format)
            currentSnapshot = (e.data ?? e) as unknown as ContextSnapshot;
          }

          if (e.type === 'llm_response' && currentSnapshot) {
            const llmEnd = (events as unknown as AnyEvent[]).find((ev) =>
              ev.type === 'llm:end' &&
              Math.abs(new Date(ev.timestamp).getTime() - new Date(e.timestamp).getTime()) < 5000
            );

            const responseData = (e.data ?? e) as unknown as LLMResponseInfo;
            const endData = (llmEnd?.data ?? llmEnd ?? {}) as Record<string, unknown>;

            iterations.push({
              iteration: currentSnapshot.iteration,
              context: currentSnapshot,
              response: responseData,
              tokensUsed: (endData.tokensUsed as number | undefined) ?? 0,
              durationMs: (endData.durationMs as number | undefined) ?? 0,
            });
            currentSnapshot = null;
          }
        }

        // Filter by iteration if specified
        const filtered = filterIteration
          ? iterations.filter(it => it.iteration === filterIteration)
          : iterations;

        if (filtered.length === 0) {
          ctx.ui.write('No context:snapshot events found. Make sure agent was run with latest build.\n');
          return { exitCode: 1 };
        }

        if (flags.json) {
          ctx.ui.write(JSON.stringify({ success: true, iterations: filtered }, null, 2) + '\n');
        } else {
          printTimeline(ctx, filtered);
        }

        return { exitCode: 0 };
      } catch (err) {
        ctx.ui.write(JSON.stringify(error('TRACE_NOT_FOUND', `Trace not found: ${taskId}`), null, 2) + '\n');
        return { exitCode: 1 };
      }
    },
  },
});

function printTimeline(ctx: PluginContextV3, iterations: IterationContext[]): void {
  ctx.ui.write('\n📋 Context Timeline\n');
  ctx.ui.write('═'.repeat(60) + '\n');

  for (const it of iterations) {
    const sw = it.context.slidingWindow;
    ctx.ui.write(`\n─── Iteration ${it.iteration} ───\n`);
    ctx.ui.write(`  📊 Context: ${it.context.messageCount} messages, ~${it.context.estimatedTokens} tokens (${it.context.totalChars} chars)\n`);
    ctx.ui.write(`  🔧 Tools available: ${it.context.toolCount}\n`);

    if (sw && sw.droppedMessages > 0) {
      ctx.ui.write(`  ⚠️  Sliding window: ${sw.droppedMessages} messages DROPPED (${sw.fullHistorySize} total, window=${sw.windowedSize})\n`);
    }

    ctx.ui.write(`\n  Messages:\n`);
    for (const msg of it.context.messages) {
      const role = msg.role.padEnd(10);
      const size = `${msg.chars}`.padStart(5) + ' chars';
      let flags = '';
      if (msg.truncated) {flags += ' [TRUNCATED]';}
      if (msg.toolCalls) {flags += ` → calls: ${msg.toolCalls.join(', ')}`;}
      if (msg.toolCallId) {flags += ` (result for ${msg.toolCallId.slice(0, 8)}...)`;}

      ctx.ui.write(`    [${msg.index}] ${role} ${size}${flags}\n`);

      // Show preview for tool results and short messages
      if (msg.preview && msg.role === 'tool' && msg.chars < 200) {
        ctx.ui.write(`        "${msg.preview.slice(0, 80)}"\n`);
      }
    }

    // LLM response
    if (it.response) {
      ctx.ui.write(`\n  🤖 Response: ${it.tokensUsed} tokens, ${it.durationMs}ms\n`);

      if (it.response.content && it.response.content.length > 0 && it.response.content !== '[Executing tools...]') {
        const preview = it.response.content.slice(0, 200).replace(/\n/g, ' ');
        ctx.ui.write(`     Text: "${preview}"\n`);
      }

      if (it.response.toolCalls && it.response.toolCalls.length > 0) {
        for (const tc of it.response.toolCalls) {
          ctx.ui.write(`     → ${tc.name}(${tc.args.slice(0, 100)})\n`);
        }
      }
    }
  }

  ctx.ui.write('\n');
}

function error(code: TraceErrorCode, message: string): TraceCommandResponse {
  return {
    success: false,
    command: 'trace:context',
    taskId: '',
    error: { code, message },
    summary: { message, severity: 'error', actionable: true },
  };
}
