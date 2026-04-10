/**
 * @module @kb-labs/core-sandbox/debug/log-query
 * Log query and filtering system
 */

/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  namespace?: string;
  message: string;
  meta?: Record<string, unknown>;
  context?: {
    traceId?: string;
    spanId?: string;
    pluginId?: string;
    file?: string;
    function?: string;
  };
}

/**
 * Log query options
 */
export interface LogQuery {
  level?: LogLevel | LogLevel[];
  namespace?: string; // Supports wildcard: @kb-labs/*
  timeRange?: { from: Date; to: Date };
  search?: string; // Text search
  context?: Record<string, unknown>; // Context filter
  limit?: number;
  format?: 'human' | 'ai' | 'json' | 'csv';
}

/**
 * Match namespace pattern (supports wildcards)
 */
function matchNamespace(pattern: string, namespace?: string): boolean {
  if (!namespace) {return false;}
  
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp(`^${regexPattern}$`);
  
  return regex.test(namespace);
}

/**
 * Match log level
 */
function matchLevel(queryLevel: LogLevel | LogLevel[], entryLevel: LogLevel): boolean {
  if (Array.isArray(queryLevel)) {
    return queryLevel.includes(entryLevel);
  }
  return queryLevel === entryLevel;
}

/**
 * Match time range
 */
function matchTimeRange(
  timeRange: { from: Date; to: Date },
  timestamp: Date
): boolean {
  return timestamp >= timeRange.from && timestamp <= timeRange.to;
}

/**
 * Match search text
 */
function matchSearch(search: string, message: string, meta?: Record<string, unknown>): boolean {
  const lowerSearch = search.toLowerCase();
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes(lowerSearch)) {
    return true;
  }
  
  // Search in meta if available
  if (meta) {
    const metaStr = JSON.stringify(meta).toLowerCase();
    if (metaStr.includes(lowerSearch)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Match context filter
 */
function matchContext(
  filter: Record<string, unknown>,
  context?: Record<string, unknown>
): boolean {
  if (!context) {return false;}
  
  for (const [key, value] of Object.entries(filter)) {
    if (context[key] !== value) {
      return false;
    }
  }
  
  return true;
}

/**
 * Query logs
 */
export function queryLogs(
  logs: LogEntry[],
  query: LogQuery
): LogEntry[] {
  let results = logs;

  // Filter by level
  if (query.level) {
    results = results.filter((entry) => matchLevel(query.level!, entry.level));
  }

  // Filter by namespace
  if (query.namespace) {
    results = results.filter((entry) => matchNamespace(query.namespace!, entry.namespace));
  }

  // Filter by time range
  if (query.timeRange) {
    results = results.filter((entry) => matchTimeRange(query.timeRange!, entry.timestamp));
  }

  // Filter by search text
  if (query.search) {
    results = results.filter((entry) => matchSearch(query.search!, entry.message, entry.meta));
  }

  // Filter by context
  if (query.context) {
    results = results.filter((entry) => matchContext(query.context!, entry.context));
  }

  // Apply limit
  if (query.limit !== undefined) {
    results = results.slice(0, query.limit);
  }

  return results;
}

/**
 * Format log entry for human reading
 */
export function formatLogEntryHuman(entry: LogEntry): string {
  const timeStr = entry.timestamp.toISOString();
  const levelStr = entry.level.toUpperCase().padEnd(5);
  const namespaceStr = entry.namespace ? `[${entry.namespace}]` : '';
  const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  
  return `${timeStr} ${levelStr} ${namespaceStr} ${entry.message}${metaStr}`;
}

/**
 * Format log entry for AI/JSON reading
 */
export function formatLogEntryAI(entry: LogEntry): string {
  return JSON.stringify({
    timestamp: entry.timestamp.toISOString(),
    level: entry.level,
    namespace: entry.namespace,
    message: entry.message,
    meta: entry.meta,
    context: entry.context,
  });
}

/**
 * Format log entry for CSV
 */
export function formatLogEntryCSV(entry: LogEntry): string {
  const escapeCSV = (str: string) => {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [
    entry.timestamp.toISOString(),
    entry.level,
    entry.namespace || '',
    escapeCSV(entry.message),
    entry.meta ? escapeCSV(JSON.stringify(entry.meta)) : '',
    entry.context ? escapeCSV(JSON.stringify(entry.context)) : '',
  ].join(',');
}

/**
 * Format logs according to query format
 */
export function formatLogs(logs: LogEntry[], format: LogQuery['format'] = 'human'): string {
  switch (format) {
    case 'json':
    case 'ai':
      return logs.map(formatLogEntryAI).join('\n');
    case 'csv':
      return [
        'timestamp,level,namespace,message,meta,context',
        ...logs.map(formatLogEntryCSV),
      ].join('\n');
    case 'human':
    default:
      return logs.map(formatLogEntryHuman).join('\n');
  }
}

/**
 * Parse logs from string format (from snapshots or files)
 */
export function parseLogs(logLines: string[]): LogEntry[] {
  const entries: LogEntry[] = [];

  for (const line of logLines) {
    if (!line.trim()) {continue;}

    // Try to parse structured log (JSON)
    try {
      const parsed = JSON.parse(line);
      if (parsed.timestamp && parsed.level && parsed.message) {
        entries.push({
          timestamp: new Date(parsed.timestamp),
          level: parsed.level,
          namespace: parsed.namespace,
          message: parsed.message,
          meta: parsed.meta,
          context: parsed.context,
        });
        continue;
      }
    } catch {
      // Not JSON, try to parse as text log
    }

    // Parse text log format: [timestamp] LEVEL [namespace] message
    const textMatch = line.match(/^\[([^\]]+)\]\s+(\w+)\s+(?:\[([^\]]+)\]\s+)?(.+)$/);
    if (textMatch && textMatch[1] && textMatch[2] && textMatch[4]) {
      const timestampStr = textMatch[1];
      const levelStr = textMatch[2];
      const namespace = textMatch[3];
      const message = textMatch[4];
      entries.push({
        timestamp: new Date(timestampStr),
        level: levelStr.toLowerCase() as LogLevel,
        namespace: namespace || undefined,
        message,
      });
      continue;
    }

    // Fallback: treat as info level log with current timestamp
    entries.push({
      timestamp: new Date(),
      level: 'info',
      message: line,
    });
  }

  return entries;
}

