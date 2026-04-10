/**
 * agent:trace:stats - Show trace statistics (AI-friendly)
 *
 * Usage:
 *   pnpm kb agent:trace:stats <taskId>
 *   pnpm kb agent:trace:stats <taskId> --json
 */

import { defineCommand, useLogger } from '@kb-labs/sdk';
import type { PluginContextV3 } from '@kb-labs/sdk';
import type {
  TraceCommandResponse,
  StatsResponse,
  TraceErrorCode,
  DetailedTraceEntry,
} from '@kb-labs/agent-contracts';
import { loadTrace, formatTraceLoadError } from '@kb-labs/agent-tracing';
import { normalizeTraceEvents } from './trace-event-normalizer.js';

type TraceStatsInput = {
  taskId?: string;
  'task-id'?: string;
  json?: boolean;
};

type TraceStatsResult = { exitCode: number; response?: TraceCommandResponse };

export default defineCommand({
  id: 'trace:stats',
  description: 'Show trace statistics with cost and performance metrics',

  handler: {
    async execute(ctx: PluginContextV3, input: TraceStatsInput): Promise<TraceStatsResult> {
      const logger = useLogger();
      const flags = (input as any).flags ?? input;
      const taskId = (flags['task-id'] ?? flags.taskId) as string | undefined;

    try {
      const loaded = await loadTrace(taskId);
      if (!loaded.ok) {
        const code: TraceErrorCode =
          loaded.error.kind === 'invalid_task_id' ? 'INVALID_TASK_ID' :
          loaded.error.kind === 'not_found' ? 'TRACE_NOT_FOUND' :
          loaded.error.kind === 'too_large' ? 'FILE_TOO_LARGE' :
          'CORRUPTED_TRACE';
        const err = error(code, formatTraceLoadError(loaded.error));
        ctx.ui.write(JSON.stringify(err, null, 2) + '\n');
        return { exitCode: 1, response: err };
      }

      const { events } = loaded;

      // Calculate stats
      const stats = calculateStats(events, taskId);

      // Build response
      const response: TraceCommandResponse<StatsResponse> = {
        success: true,
        command: 'trace:stats',
        taskId: taskId ?? '',
        data: stats,
        summary: {
          message: `${stats.iterations.total} iterations, ${stats.llm.calls} LLM calls, $${stats.cost.total.toFixed(4)} cost`,
          severity: stats.errors > 0 ? 'warning' : 'info',
          actionable: stats.errors > 5,
        },
      };

      // Output
      if (flags.json) {
        ctx.ui.write(JSON.stringify(response, null, 2) + '\n');
      } else {
        printHumanReadable(ctx, stats);
      }

      return { exitCode: 0, response };
    } catch (err) {
      logger.error('trace:stats error:', err instanceof Error ? err : undefined);
      const errResponse = error('IO_ERROR', err instanceof Error ? err.message : String(err));
      ctx.ui.write(JSON.stringify(errResponse, null, 2) + '\n');
      return { exitCode: 1, response: errResponse };
    }
    },
  },
});

/**
 * Calculate statistics from trace events
 */
function calculateStats(events: DetailedTraceEntry[], taskId?: string): StatsResponse {
  const normalized = normalizeTraceEvents(events);
  const iterationSet = new Set<number>();
  for (const e of normalized) {
    if (e.iteration > 0) {
      iterationSet.add(e.iteration);
    }
  }

  const llmStartEvents = normalized.filter((e) => e.type === 'llm:start' || e.type === 'llm:call' || e.type === 'llm_call');
  const llmEndEvents = normalized.filter((e) => e.type === 'llm:end' || e.type === 'llm:call');
  const toolEndEvents = normalized.filter((e) => e.type === 'tool:end' || e.type === 'tool:execution' || e.type === 'tool_result');
  const errorEvents = normalized.filter((e) => e.type === 'error:captured' || e.type === 'agent:error' || e.type === 'tool:error');

  // Calculate LLM stats (handle both new and legacy data structures)
  const inputTokens = llmEndEvents.reduce((sum, e) => {
    const tokens = (e.raw as any).response?.usage?.inputTokens || 0;
    return sum + tokens;
  }, 0);

  const outputTokens = llmEndEvents.reduce((sum, e) => {
    const tokens = (e.raw as any).response?.usage?.outputTokens || 0;
    return sum + tokens;
  }, 0);

  const legacyTotalTokens = llmEndEvents.reduce((sum, e) => {
    const tokens = (e.data.tokensUsed as number | undefined) || 0;
    return sum + tokens;
  }, 0);

  const totalCost = llmEndEvents.reduce((sum, e) => {
    const cost = (e.raw as any).cost?.totalCost || 0;
    return sum + cost;
  }, 0);

  // Calculate tool stats (handle both new and legacy formats)
  const toolCounts: Record<string, number> = {};
  let successfulTools = 0;
  let failedTools = 0;

  for (const tool of toolEndEvents) {
    const toolName = (tool.raw as any).tool?.name || (tool.data.toolName as string | undefined) || 'unknown';
    toolCounts[toolName] = (toolCounts[toolName] || 0) + 1;

    const success = (tool.raw as any).output?.success ?? tool.data.success ?? true;
    if (success) {
      successfulTools++;
    } else {
      failedTools++;
    }
  }

  // Calculate timing
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const startedAt = firstEvent?.timestamp || new Date().toISOString();
  const completedAt = lastEvent?.timestamp || new Date().toISOString();
  const totalDurationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

  return {
    taskId: taskId || 'unknown',
    status: errorEvents.length > 0 ? 'failed' : 'success',

    iterations: {
      total: iterationSet.size,
      completed: iterationSet.size,
    },

    llm: {
      calls: llmStartEvents.length,
      inputTokens,
      outputTokens,
      // Use explicit tokens if available, otherwise fall back to legacy total
      totalTokens: (inputTokens + outputTokens) || legacyTotalTokens,
    },

    tools: {
      totalCalls: toolEndEvents.length,
      byTool: toolCounts,
      successful: successfulTools,
      failed: failedTools,
    },

    timing: {
      startedAt,
      completedAt,
      totalDurationMs,
      durationFormatted: formatDuration(totalDurationMs),
    },

    cost: {
      total: totalCost,
      currency: 'USD',
    },

    errors: errorEvents.length,
  };
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Print human-readable output
 */
function printHumanReadable(ctx: PluginContextV3, stats: StatsResponse): void {
  ctx.ui.write('\n');
  ctx.ui.write('📊 Trace Statistics\n');
  ctx.ui.write('\n');

  ctx.ui.write(`Status: ${stats.status === 'success' ? '✅ Success' : '❌ Failed'}\n`);
  ctx.ui.write(`Iterations: ${stats.iterations.total}\n`);
  ctx.ui.write('\n');

  ctx.ui.write('🤖 LLM Usage:\n');
  ctx.ui.write(`  Calls: ${stats.llm.calls}\n`);
  ctx.ui.write(`  Input tokens: ${stats.llm.inputTokens.toLocaleString()}\n`);
  ctx.ui.write(`  Output tokens: ${stats.llm.outputTokens.toLocaleString()}\n`);
  ctx.ui.write(`  Total tokens: ${stats.llm.totalTokens.toLocaleString()}\n`);
  ctx.ui.write('\n');

  ctx.ui.write('🔧 Tool Usage:\n');
  ctx.ui.write(`  Total calls: ${stats.tools.totalCalls}\n`);
  ctx.ui.write(`  Successful: ${stats.tools.successful}\n`);
  ctx.ui.write(`  Failed: ${stats.tools.failed}\n`);
  ctx.ui.write('  By tool:\n');
  for (const [tool, count] of Object.entries(stats.tools.byTool)) {
    ctx.ui.write(`    ${tool}: ${count}\n`);
  }
  ctx.ui.write('\n');

  ctx.ui.write('⏱️  Timing:\n');
  ctx.ui.write(`  Started: ${stats.timing.startedAt}\n`);
  ctx.ui.write(`  Completed: ${stats.timing.completedAt}\n`);
  ctx.ui.write(`  Duration: ${stats.timing.durationFormatted}\n`);
  ctx.ui.write('\n');

  ctx.ui.write('💰 Cost:\n');
  ctx.ui.write(`  Total: $${stats.cost.total.toFixed(4)} ${stats.cost.currency}\n`);
  ctx.ui.write('\n');

  if (stats.errors > 0) {
    ctx.ui.write(`⚠️  Errors: ${stats.errors}\n`);
    ctx.ui.write('\n');
  }
}

/**
 * Create error response
 */
function error(code: TraceErrorCode, message: string): TraceCommandResponse {
  return {
    success: false,
    command: 'trace:stats',
    taskId: '',
    error: {
      code,
      message,
    },
    summary: {
      message,
      severity: 'error',
      actionable: true,
    },
  };
}
