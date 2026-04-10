/**
 * logs search — Full-text search across logs (FTS5)
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';
import type { LogRecord } from '@kb-labs/core-platform';
import { formatLogLine, formatLogJson } from './logs-utils';

type Flags = {
  limit: { type: 'number'; description?: string };
  offset: { type: 'number'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const logsSearch = defineSystemCommand<Flags, CommandResult>({
  name: 'search',
  description: 'Full-text search across logs',
  category: 'logs',
  examples: generateExamples('logs search', 'kb', [
    { flags: {}, description: '"authentication failed"' },
    { flags: { json: true, limit: 20 }, description: '"connection refused"' },
  ]),
  flags: {
    limit: { type: 'number', description: 'Max records (default: 50)' },
    offset: { type: 'number', description: 'Skip N records for pagination' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(_ctx, argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const searchText = argv[0];
    if (!searchText) {
      return { ok: false, error: 'Search text required. Usage: kb logs search "your query"' };
    }

    const caps = reader.getCapabilities();
    if (!caps.hasSearch) {
      return { ok: false, error: 'Full-text search not available. Ensure SQLite persistence is enabled.' };
    }

    const result = await reader.search(searchText, {
      limit: flags.limit ?? 50,
      offset: flags.offset ?? 0,
    });

    return {
      ok: true,
      query: searchText,
      logs: result.logs.map(formatLogJson),
      total: result.total,
      hasMore: result.hasMore,
      _raw: result.logs,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      const { _raw, ...jsonResult } = result as any;
      ctx.ui.json(jsonResult);
      return;
    }

    if (!result.ok) {
      ctx.ui.error('Log Search', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown'] }] });
      return;
    }

    const raw = (result as any)._raw as LogRecord[];
    if (!raw || raw.length === 0) {
      ctx.ui.write(`No logs found matching "${(result as any).query}".\n`);
      return;
    }

    ctx.ui.write(`Search results for "${(result as any).query}":\n\n`);
    for (const record of raw) {
      ctx.ui.write(formatLogLine(record) + '\n');
    }

    ctx.ui.write(`\n--- ${raw.length} of ${(result as any).total} matches ---\n`);
  },
});
