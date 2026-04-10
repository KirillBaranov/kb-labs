/**
 * logs diagnose — "What went wrong?" Automated error analysis.
 * Agent-first command: single call gives a full diagnostic report.
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';
import { parseRelativeTime, computeLogStats, formatLogLine } from './logs-utils';
import type { LogQuery, LogRecord } from '@kb-labs/core-platform';

type Flags = {
  from: { type: 'string'; description?: string };
  source: { type: 'string'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const logsDiagnose = defineSystemCommand<Flags, CommandResult>({
  name: 'diagnose',
  description: 'Analyze recent errors and warnings (agent-friendly diagnostic report)',
  category: 'logs',
  examples: generateExamples('logs diagnose', 'kb', [
    { flags: { json: true }, description: 'Full diagnostic in JSON' },
    { flags: { from: '"30m"', source: 'rest' }, description: 'REST errors in last 30m' },
  ]),
  flags: {
    from: { type: 'string', description: 'Time period (default: "1h"). Relative: 1h, 30m, 2d' },
    source: { type: 'string', description: 'Filter by source (rest, workflow, cli)' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(_ctx, _argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const fromTs = flags.from ? parseRelativeTime(flags.from) : Date.now() - 3_600_000;
    const toTs = Date.now();

    const query: LogQuery = {
      from: fromTs,
      to: toTs,
    };
    if (flags.source) {query.source = flags.source;}

    // Fetch all logs in period (up to 5000 for analysis)
    const result = await reader.query(query, { limit: 5000, sortOrder: 'desc' });
    const diagnostics = computeLogStats(result.logs);

    return {
      ok: true,
      period: {
        from: new Date(fromTs).toISOString(),
        to: new Date(toTs).toISOString(),
      },
      summary: {
        total: diagnostics.total,
        errors: diagnostics.errors,
        warnings: diagnostics.warnings,
        sources: diagnostics.sources,
      },
      topErrors: diagnostics.topErrors,
      bySource: diagnostics.bySource,
      recentErrors: diagnostics.recentErrors,
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
      ctx.ui.error('Log Diagnose', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown'] }] });
      return;
    }

    const data = result as any;
    const { summary, topErrors, bySource, period } = data;

    // Summary
    const summaryItems = [
      `Period: ${period.from} to ${period.to}`,
      `Total logs: ${summary.total}`,
      `Errors: ${summary.errors}`,
      `Warnings: ${summary.warnings}`,
      `Sources: ${summary.sources.join(', ') || 'none'}`,
    ];

    const sections: Array<{ header: string; items: string[] }> = [
      { header: 'Summary', items: summaryItems },
    ];

    // Top errors
    if (topErrors.length > 0) {
      sections.push({
        header: 'Top Errors',
        items: topErrors.slice(0, 5).map(
          (e: any, i: number) => `${i + 1}. "${e.message}" (${e.count}x) [${e.source}]`,
        ),
      });
    }

    // By source
    const sourceItems: string[] = [];
    for (const [src, breakdown] of Object.entries(bySource)) {
      const b = breakdown as any;
      if (b.errors > 0 || b.warnings > 0) {
        sourceItems.push(`${src}: ${b.errors} errors, ${b.warnings} warnings`);
      }
    }
    if (sourceItems.length > 0) {
      sections.push({ header: 'By Source', items: sourceItems });
    }

    if (summary.errors === 0 && summary.warnings === 0) {
      ctx.ui.success('Log Diagnosis', { sections });
    } else if (summary.errors > 0) {
      ctx.ui.error('Log Diagnosis', { sections });
    } else {
      ctx.ui.warn('Log Diagnosis', { sections });
    }

    // Recent errors
    const raw = data._raw as LogRecord[];
    const errorLogs = raw
      .filter((l) => l.level === 'error' || l.level === 'fatal')
      .slice(0, 5);

    if (errorLogs.length > 0) {
      ctx.ui.write('\nRecent Errors:\n');
      for (const log of errorLogs) {
        ctx.ui.write('  ' + formatLogLine(log) + '\n');
      }
    }
  },
});
