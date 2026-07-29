/**
 * logs query — Query logs with filters and pagination
 */

import {
  defineSystemCommand,
  type CommandResult,
} from "@kb-labs/shared-command-kit";
import { generateExamples } from "../../../utils/generate-examples";
import { platform } from "@kb-labs/core-runtime";
import type { LogQuery, LogRecord, LogLevel } from "@kb-labs/core-platform";
import { parseRelativeTime, formatLogLine, formatLogJson } from "./logs-utils";

type LogQueryResult = CommandResult & {
  logs?: ReturnType<typeof formatLogJson>[];
  total?: number;
  hasMore?: boolean;
  source?: string;
  _raw?: LogRecord[];
};

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

export const logsQuery = defineSystemCommand<Flags, LogQueryResult>({
  name: "query",
  description:
    "Query logs by level, platform context, correlation, and time range",
  category: "logs",
  examples: generateExamples("logs query", "kb", [
    { flags: { level: "error", limit: 10 }, description: "Last 10 errors" },
    { flags: { from: '"1h"', json: true }, description: "Last hour in JSON" },
    {
      flags: { source: "rest", level: "warn" },
      description: "Warnings from REST API",
    },
  ]),
  flags: {
    level: {
      type: "string",
      description: "Filter by level (trace/debug/info/warn/error/fatal)",
    },
    source: {
      type: "string",
      description: "Filter by source (rest, workflow, cli, etc.)",
    },
    "application-id": {
      type: "string",
      description: "Filter by application ID",
    },
    "service-id": { type: "string", description: "Filter by service ID" },
    "plugin-id": { type: "string", description: "Filter by plugin ID" },
    component: { type: "string", description: "Filter by component" },
    operation: { type: "string", description: "Filter by operation" },
    "request-id": { type: "string", description: "Filter by request ID" },
    "trace-id": { type: "string", description: "Filter by trace ID" },
    "execution-id": { type: "string", description: "Filter by execution ID" },
    from: {
      type: "string",
      description: "Start time (relative: 1h, 30m, 2d or ISO date)",
    },
    to: { type: "string", description: "End time (relative or ISO date)" },
    limit: { type: "number", description: "Max records (default: 50)" },
    offset: { type: "number", description: "Skip N records for pagination" },
    json: { type: "boolean", description: "Output in JSON format" },
  },
  async handler(_ctx, _argv, flags) {
    const reader = platform.logs;
    if (!reader) {
      return {
        ok: false,
        error: "Log reader not available. Ensure platform is initialized.",
      };
    }

    const query: LogQuery = {};
    if (flags.level) {
      query.level = flags.level as LogLevel;
    }
    if (flags.source) {
      query.source = flags.source;
    }
    if (flags["application-id"]) {
      query.applicationId = flags["application-id"];
    }
    if (flags["service-id"]) {
      query.serviceId = flags["service-id"];
    }
    if (flags["plugin-id"]) {
      query.pluginId = flags["plugin-id"];
    }
    if (flags.component) {
      query.component = flags.component;
    }
    if (flags.operation) {
      query.operation = flags.operation;
    }
    if (flags["request-id"]) {
      query.requestId = flags["request-id"];
    }
    if (flags["trace-id"]) {
      query.traceId = flags["trace-id"];
    }
    if (flags["execution-id"]) {
      query.executionId = flags["execution-id"];
    }
    if (flags.from) {
      query.from = parseRelativeTime(flags.from);
    }
    if (flags.to) {
      query.to = parseRelativeTime(flags.to);
    }

    const result = await reader.query(query, {
      limit: flags.limit ?? 50,
      offset: flags.offset ?? 0,
      sortOrder: "desc",
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
      const { _raw, ...jsonResult } = result;
      ctx.ui.json(jsonResult);
      return;
    }

    if (!result.ok) {
      const error = typeof result.error === "string" ? result.error : "Unknown";
      ctx.ui.error("Log Query", {
        sections: [{ header: "Error", items: [error] }],
      });
      return;
    }

    const raw = result._raw;
    if (!raw || raw.length === 0) {
      ctx.ui.write("No logs found matching criteria.\n");
      return;
    }

    for (const record of raw) {
      ctx.ui.write(formatLogLine(record) + "\n");
    }

    ctx.ui.write(
      `\n--- ${raw.length} of ${result.total} logs (source: ${result.source}) ---\n`,
    );
  },
});
