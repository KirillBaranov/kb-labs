/**
 * logs query — Query logs with filters and pagination
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';
import type { LogQuery, LogRecord } from '@kb-labs/core-platform';
import { parseRelativeTime, formatLogLine, formatLogJson } from './logs-utils';

type Flags = {
  level: { type: 'string'; description?: string };
  source: { type: 'string'; description?: string };
  from: { type: 'string'; description?: string };
  to: { type: 'string'; description?: string };
  limit: { type: 'number'; description?: string };
  offset: { type: 'number'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const logsQuery = defineSystemCommand<Flags, CommandResult>({
  name: 'query',
  description: 'Query logs with filters (level, source, time range)',
  category: 'logs',
  examples: generateExamples('logs query', 'kb', [
    { flags: { level: 'error', limit: 10 }, description: 'Last 10 errors' },
    { flags: { from: '"1h"', json: true }, description: 'Last hour in JSON' },
    { flags: { source: 'rest', level: 'warn' }, description: 'Warnings from REST API' },
  ]),
  flags: {
    level: { type: 'string', description: 'Filter by level (trace/debug/info/warn/error/fatal)' },
    source: { type: 'string', description: 'Filter by source (rest, workflow, cli, etc.)' },
    from: { type: 'string', description: 'Start time (relative: 1h, 30m, 2d or ISO date)' },
    to: { type: 'string', description: 'End time (relative or ISO date)' },
    limit: { type: 'number', description: 'Max records (default: 50)' },
    offset: { type: 'number', description: 'Skip N records for pagination' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(_ctx, _argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const query: LogQuery = {};
    if (flags.level) {query.level = flags.level as any;}
    if (flags.source) {query.source = flags.source;}
    if (flags.from) {query.from = parseRelativeTime(flags.from);}
    if (flags.to) {query.to = parseRelativeTime(flags.to);}

    const result = await reader.query(query, {
      limit: flags.limit ?? 50,
      offset: flags.offset ?? 0,
      sortOrder: 'desc',
    });

    return {
      ok: true,
      logs: result.logs.map(formatLogJson),
      total: result.total,
      hasMore: result.hasMore,
      source: result.source,
      _raw: result.logs, // kept for formatter
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      const { _raw, ...jsonResult } = result as any;
      ctx.ui.json(jsonResult);
      return;
    }

    if (!result.ok) {
      ctx.ui.error('Log Query', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown'] }] });
      return;
    }

    const raw = (result as any)._raw as LogRecord[];
    if (!raw || raw.length === 0) {
      ctx.ui.write('No logs found matching criteria.\n');
      return;
    }

    for (const record of raw) {
      ctx.ui.write(formatLogLine(record) + '\n');
    }

    ctx.ui.write(`\n--- ${raw.length} of ${(result as any).total} logs (source: ${(result as any).source}) ---\n`);
  },
});
