/**
 * logs search — Full-text search across logs (FTS5)
 */

import {
  defineSystemCommand,
  type CommandResult,
} from "@kb-labs/shared-command-kit";
import { generateExamples } from "../../../utils/generate-examples";
import { platform } from "@kb-labs/core-runtime";
import type { LogLevel, LogQuery, LogRecord } from "@kb-labs/core-platform";
import { formatLogLine, formatLogJson, parseRelativeTime } from "./logs-utils";

type Flags = {
  level: { type: "string"; description?: string };
  source: { type: "string"; description?: string };
  "application-id": { type: "string"; description?: string };
  "service-id": { type: "string"; description?: string };
  "plugin-id": { type: "string"; description?: string };
  component: { type: "string"; description?: string };
  operation: { type: "string"; description?: string };
  "request-id": { type: "string"; description?: string };
  "trace-id": { type: "string"; description?: string };
  "execution-id": { type: "string"; description?: string };
  from: { type: "string"; description?: string };
  to: { type: "string"; description?: string };
  limit: { type: "number"; description?: string };
  offset: { type: "number"; description?: string };
  json: { type: "boolean"; description?: string };
};

type LogSearchResult = CommandResult & {
  _raw?: LogRecord[];
  query?: string;
  logs?: object[];
  total?: number;
  hasMore?: boolean;
};

export const logsSearch = defineSystemCommand<Flags, LogSearchResult>({
  name: "search",
  description: "Full-text search across logs",
  category: "logs",
  examples: generateExamples("logs search", "kb", [
    { flags: {}, description: '"authentication failed"' },
    { flags: { json: true, limit: 20 }, description: '"connection refused"' },
  ]),
  flags: {
    level: { type: "string", description: "Minimum log level" },
    source: { type: "string", description: "Filter by source" },
    "application-id": { type: "string", description: "Filter by application ID" },
    "service-id": { type: "string", description: "Filter by service ID" },
    "plugin-id": { type: "string", description: "Filter by plugin ID" },
    component: { type: "string", description: "Filter by component" },
    operation: { type: "string", description: "Filter by operation" },
    "request-id": { type: "string", description: "Filter by request ID" },
    "trace-id": { type: "string", description: "Filter by trace ID" },
    "execution-id": { type: "string", description: "Filter by execution ID" },
    from: { type: "string", description: "Start time (relative or ISO)" },
    to: { type: "string", description: "End time (relative or ISO)" },
    limit: { type: "number", description: "Max records (default: 50)" },
    offset: { type: "number", description: "Skip N records for pagination" },
    json: { type: "boolean", description: "Output in JSON format" },
  },
  async handler(_ctx, argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return {
        ok: false,
        error: "Log reader not available. Ensure platform is initialized.",
      };
    }

    const searchText = argv[0];
    if (!searchText) {
      return {
        ok: false,
        error: 'Search text required. Usage: kb logs search "your query"',
      };
    }

    const filters: LogQuery = {
      ...(flags.level ? { level: flags.level as LogLevel } : {}),
      ...(flags.source ? { source: flags.source } : {}),
      ...(flags["application-id"] ? { applicationId: flags["application-id"] } : {}),
      ...(flags["service-id"] ? { serviceId: flags["service-id"] } : {}),
      ...(flags["plugin-id"] ? { pluginId: flags["plugin-id"] } : {}),
      ...(flags.component ? { component: flags.component } : {}),
      ...(flags.operation ? { operation: flags.operation } : {}),
      ...(flags["request-id"] ? { requestId: flags["request-id"] } : {}),
      ...(flags["trace-id"] ? { traceId: flags["trace-id"] } : {}),
      ...(flags["execution-id"] ? { executionId: flags["execution-id"] } : {}),
      ...(flags.from ? { from: parseRelativeTime(flags.from) } : {}),
      ...(flags.to ? { to: parseRelativeTime(flags.to) } : {}),
    };

    const result = await reader.search(searchText, {
      limit: flags.limit ?? 50,
      offset: flags.offset ?? 0,
      filters,
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
      const { _raw, ...jsonResult } = result;
      ctx.ui.json(jsonResult);
      return;
    }

    if (!result.ok) {
      const error = typeof result.error === "string" ? result.error : "Unknown";
      ctx.ui.error("Log Search", {
        sections: [{ header: "Error", items: [error] }],
      });
      return;
    }

    const raw = result._raw;
    if (!raw || raw.length === 0) {
      ctx.ui.write(`No logs found matching "${result.query}".\n`);
      return;
    }

    ctx.ui.write(`Search results for "${result.query}":\n\n`);
    for (const record of raw) {
      ctx.ui.write(formatLogLine(record) + "\n");
    }

    ctx.ui.write(`\n--- ${raw.length} of ${result.total} matches ---\n`);
  },
});
