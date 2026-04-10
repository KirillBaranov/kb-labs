/**
 * logs context — Show full timeline for an execution/trace/request.
 * Agent-first: "What happened in this workflow run?"
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';
import { formatLogLine, formatLogJson, extractCorrelationKeys } from './logs-utils';
import type { LogRecord } from '@kb-labs/core-platform';

type Flags = {
  'execution-id': { type: 'string'; description?: string };
  'trace-id': { type: 'string'; description?: string };
  'request-id': { type: 'string'; description?: string };
  limit: { type: 'number'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const logsContext = defineSystemCommand<Flags, CommandResult>({
  name: 'context',
  description: 'Show full timeline for an execution, trace, or request',
  category: 'logs',
  examples: generateExamples('logs context', 'kb', [
    { flags: { 'execution-id': '"exec-abc123"', json: true }, description: 'Workflow execution timeline' },
    { flags: { 'trace-id': '"trace-xyz"' }, description: 'Distributed trace timeline' },
  ]),
  flags: {
    'execution-id': { type: 'string', description: 'Filter by execution ID' },
    'trace-id': { type: 'string', description: 'Filter by trace ID' },
    'request-id': { type: 'string', description: 'Filter by request ID' },
    limit: { type: 'number', description: 'Max records (default: 200)' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(_ctx, _argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const executionId = flags['execution-id'];
    const traceId = flags['trace-id'];
    const requestId = flags['request-id'];

    if (!executionId && !traceId && !requestId) {
      return {
        ok: false,
        error: 'At least one correlation key required: --execution-id, --trace-id, or --request-id',
      };
    }

    // Fetch a broad set of recent logs (last 24h, up to 5000)
    const maxLogs = flags.limit ?? 200;
    const result = await reader.query(
      { from: Date.now() - 86_400_000 },
      { limit: 5000, sortOrder: 'asc' },
    );

    // Filter by correlation key in memory
    const matched = result.logs.filter((log) => {
      const keys = extractCorrelationKeys(log);
      if (executionId && keys.executionId === executionId) {return true;}
      if (traceId && keys.traceId === traceId) {return true;}
      if (requestId && keys.requestId === requestId) {return true;}
      return false;
    }).slice(0, maxLogs);

    // Compute timeline metadata
    const firstTs = matched.length > 0 ? matched[0]!.timestamp : 0;
    const lastTs = matched.length > 0 ? matched[matched.length - 1]!.timestamp : 0;

    const levelCounts: Record<string, number> = {};
    const sourceCounts: Record<string, number> = {};
    for (const log of matched) {
      levelCounts[log.level] = (levelCounts[log.level] || 0) + 1;
      sourceCounts[log.source] = (sourceCounts[log.source] || 0) + 1;
    }

    return {
      ok: true,
      correlationKey: executionId ? { executionId } : traceId ? { traceId } : { requestId },
      timeline: {
        total: matched.length,
        from: firstTs ? new Date(firstTs).toISOString() : null,
        to: lastTs ? new Date(lastTs).toISOString() : null,
        durationMs: lastTs - firstTs,
      },
      byLevel: levelCounts,
      bySource: sourceCounts,
      logs: matched.map(formatLogJson),
      _raw: matched,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      const { _raw, ...jsonResult } = result as any;
      ctx.ui.json(jsonResult);
      return;
    }

    if (!result.ok) {
      ctx.ui.error('Log Context', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown'] }] });
      return;
    }

    const data = result as any;
    const { timeline, correlationKey, byLevel } = data;
    const raw = data._raw as LogRecord[];

    // Header
    const keyStr = Object.entries(correlationKey).map(([k, v]) => `${k}=${v}`).join(', ');
    const durationStr = timeline.durationMs > 0 ? `${timeline.durationMs}ms` : 'instant';

    ctx.ui.success('Execution Context', {
      sections: [{
        header: `${keyStr}`,
        items: [
          `Total events: ${timeline.total}`,
          `Duration: ${durationStr}`,
          `Time: ${timeline.from ?? 'N/A'} → ${timeline.to ?? 'N/A'}`,
          `Levels: ${Object.entries(byLevel).map(([k, v]) => `${k}=${v}`).join(', ')}`,
        ],
      }],
    });

    // Timeline
    if (raw.length > 0) {
      ctx.ui.write('\nTimeline:\n');
      for (const log of raw) {
        ctx.ui.write('  ' + formatLogLine(log) + '\n');
      }
    } else {
      ctx.ui.write('\nNo logs found for this correlation key.\n');
    }
  },
});
