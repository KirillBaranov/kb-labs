/**
 * logs get — Get single log by ID with optional related logs
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import { platform } from '@kb-labs/core-runtime';
import type { LogRecord } from '@kb-labs/core-platform';
import { formatLogLine, formatLogJson, findRelatedLogs, extractCorrelationKeys } from './logs-utils';

type Flags = {
  related: { type: 'boolean'; description?: string };
  json: { type: 'boolean'; description?: string };
};

export const logsGet = defineSystemCommand<Flags, CommandResult>({
  name: 'get',
  description: 'Get single log by ID (with optional related logs)',
  category: 'logs',
  examples: generateExamples('logs get', 'kb', [
    { flags: {}, description: '<log-id>' },
    { flags: { related: true, json: true }, description: '<log-id>' },
  ]),
  flags: {
    related: { type: 'boolean', description: 'Include related logs (same trace/execution/request)' },
    json: { type: 'boolean', description: 'Output in JSON format' },
  },
  async handler(_ctx, argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return { ok: false, error: 'Log reader not available. Ensure platform is initialized.' };
    }

    const id = argv[0];
    if (!id) {
      return { ok: false, error: 'Log ID required. Usage: kb logs get <id>' };
    }

    const log = await reader.getById(id);
    if (!log) {
      return { ok: false, error: `Log not found: ${id}` };
    }

    let related: object[] | undefined;
    if (flags.related) {
      const relatedLogs = await findRelatedLogs(reader, log);
      related = relatedLogs.map(formatLogJson);
    }

    return {
      ok: true,
      log: formatLogJson(log),
      correlationKeys: extractCorrelationKeys(log),
      related,
      _rawLog: log,
      _rawRelated: flags.related ? related : undefined,
    };
  },
  formatter(result, ctx, flags) {
    if (flags.json) {
      const { _rawLog, _rawRelated, ...jsonResult } = result as any;
      ctx.ui.json(jsonResult);
      return;
    }

    if (!result.ok) {
      ctx.ui.error('Log Get', { sections: [{ header: 'Error', items: [result.error ?? 'Unknown'] }] });
      return;
    }

    const rawLog = (result as any)._rawLog as LogRecord;
    const logJson = (result as any).log as any;
    const keys = (result as any).correlationKeys as any;

    // Detailed view of the log
    ctx.ui.write(formatLogLine(rawLog) + '\n\n');

    const details = [
      `ID: ${logJson.id}`,
      `Time: ${logJson.time}`,
      `Level: ${logJson.level}`,
      `Source: ${logJson.source}`,
    ];

    if (keys.traceId) {details.push(`Trace ID: ${keys.traceId}`);}
    if (keys.executionId) {details.push(`Execution ID: ${keys.executionId}`);}
    if (keys.requestId) {details.push(`Request ID: ${keys.requestId}`);}
    if (keys.sessionId) {details.push(`Session ID: ${keys.sessionId}`);}

    // Show fields
    const fieldsToShow = { ...rawLog.fields };
    delete fieldsToShow.level;
    delete fieldsToShow.time;
    delete fieldsToShow.traceId;
    delete fieldsToShow.executionId;
    delete fieldsToShow.requestId;
    delete fieldsToShow.reqId;
    delete fieldsToShow.sessionId;

    if (Object.keys(fieldsToShow).length > 0) {
      details.push(`Fields: ${JSON.stringify(fieldsToShow, null, 2)}`);
    }

    ctx.ui.success('Log Detail', { sections: [{ header: 'Info', items: details }] });

    // Related logs
    const related = (result as any).related as object[] | undefined;
    if (related && related.length > 0) {
      ctx.ui.write(`\nRelated Logs (${related.length}):\n`);
      for (const r of related) {
        ctx.ui.write(`  ${(r as any).time} ${(r as any).level.toUpperCase().padEnd(5)} [${(r as any).source}] ${(r as any).msg}\n`);
      }
    }
  },
});
