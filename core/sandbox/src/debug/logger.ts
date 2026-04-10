/**
 * @module @kb-labs/core-sandbox/debug/logger
 * Structured debug logging for sandbox components
 */

/**
 * Debug format modes
 */
export type DebugFormat = 'ai' | 'human';

/**
 * Debug detail levels
 */
export type DebugDetailLevel = 'debug' | 'verbose' | 'trace';

/**
 * Debug logger options
 */
export interface DebugLoggerOptions {
  format?: DebugFormat;
  detailLevel?: DebugDetailLevel;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  jsonMode?: boolean;
}

/**
 * Execution context with debug options
 */
export interface ExecutionContextWithDebug {
  debug?: boolean;
  debugLevel?: 'verbose' | 'inspect' | 'profile';
  debugFormat?: DebugFormat;
  jsonMode?: boolean;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

/**
 * Create logger options from execution context
 */
export function createLoggerOptionsFromContext(
  ctx: ExecutionContextWithDebug | undefined,
  spanId?: string,
  parentSpanId?: string
): DebugLoggerOptions {
  // Handle undefined ctx gracefully
  if (!ctx) {
    return {
      format: 'human',
      detailLevel: 'verbose',
      traceId: undefined,
      spanId,
      parentSpanId,
      jsonMode: false,
    };
  }

  // Map debugLevel to detailLevel
  let detailLevel: DebugDetailLevel = 'verbose';
  if (ctx.debugLevel === 'inspect' || ctx.debugLevel === 'profile') {
    detailLevel = 'trace';
  } else if (ctx.debugLevel === 'verbose') {
    detailLevel = 'verbose';
  }

  return {
    format: ctx.debugFormat || (ctx.jsonMode ? 'ai' : 'human'),
    detailLevel,
    traceId: ctx.traceId,
    spanId: spanId || ctx.spanId,
    parentSpanId: parentSpanId || ctx.parentSpanId,
    jsonMode: ctx.jsonMode,
  };
}

/**
 * Debug logger interface
 */
export interface DebugLogger {
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
  group(name: string): void;
  groupEnd(): void;
  time(label: string): void;
  timeEnd(label: string): void;
  // New methods for enhanced logging
  debugLazy(getMessage: () => string, meta?: object): void;
  getEntries(): DebugLogEntry[];
  clearEntries(): void;
}

/**
 * Debug log entry
 */
export interface DebugLogEntry {
  timestamp: number;
  namespace: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: object;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  duration?: number;
  group?: string;
  groupDepth?: number;
}

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: object;
  timestamp: number;
  namespace: string;
}

/**
 * Check if debug logging is enabled
 */
function isDebugEnabled(namespace: string): boolean {
  // Check process.env.DEBUG (supports patterns like @kb-labs/*)
  if (process.env.DEBUG) {
    const debugPatterns = process.env.DEBUG.split(',').map(p => p.trim());
    return debugPatterns.some(pattern => {
      // Support wildcards: @kb-labs/* matches @kb-labs/core-sandbox:*
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return namespace.startsWith(prefix);
      }
      return namespace === pattern || namespace.startsWith(pattern + ':');
    });
  }
  return false;
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: LogEntry, enabled: boolean): string {
  if (!enabled) {return '';}
  
  const timestamp = new Date(entry.timestamp).toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const namespace = `[${entry.namespace}]`;
  const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  
  return `${timestamp} ${level} ${namespace} ${entry.message}${metaStr}`;
}

/**
 * Create a debug logger instance
 */
export function createDebugLogger(enabled: boolean, namespace: string, options?: DebugLoggerOptions): DebugLogger {
  const actuallyEnabled = enabled || isDebugEnabled(namespace);
  const opts = options || {};
  const format: DebugFormat = opts.format || (opts.jsonMode ? 'ai' : 'human');
  const detailLevel: DebugDetailLevel = opts.detailLevel || 'verbose';
  const timers = new Map<string, number>();
  let groupDepth = 0;
  let currentGroup: string | undefined;
  const entries: DebugLogEntry[] = [];
  
  // Import formatters from shared-cli-ui (required dependency)
  // Note: Using dynamic import to avoid circular dependencies
  // Formatters are loaded synchronously on first use
  // Note: Types from shared-cli-ui may differ slightly, so we use a more flexible type
  interface DebugFormatters {
    formatDebugEntryAI: (entry: unknown) => string;
    formatDebugEntryHuman: (entry: unknown, options?: unknown) => string;
    shouldUseAIFormat: (format?: DebugFormat, jsonMode?: boolean) => boolean;
  }
  let formatters: DebugFormatters | null = null;
  let formattersError: Error | null = null;
  let formattersLoading: Promise<void> | null = null;
  
  const loadFormattersAsync = async (): Promise<void> => {
    if (formatters !== null || formattersLoading) {
      return;
    }

    formattersLoading = (async () => {
      try {
        // Dynamic import to avoid circular dependencies
         
        const debugModule = await import('@kb-labs/shared-cli-ui/debug');
        if (!debugModule || !debugModule.formatDebugEntryAI || !debugModule.formatDebugEntryHuman) {
          throw new Error('Debug formatters not found in @kb-labs/shared-cli-ui/debug');
        }
        formatters = {
          formatDebugEntryAI: debugModule.formatDebugEntryAI as (entry: unknown) => string,
          formatDebugEntryHuman: debugModule.formatDebugEntryHuman as (entry: unknown, options?: unknown) => string,
          shouldUseAIFormat: debugModule.shouldUseAIFormat || ((f?: DebugFormat, j?: boolean) => f === 'ai' || j === true),
        };
      } catch (error) {
        // Don't throw - use fallback format instead
        // This allows the logger to work even if shared-cli-ui is not available
        formattersError = new Error(
          `Failed to load debug formatters from @kb-labs/shared-cli-ui: ${error instanceof Error ? error.message : String(error)}. ` +
          `Using fallback format. Make sure @kb-labs/shared-cli-ui is installed for enhanced formatting.`
        );
        // Don't throw - just log and use fallback
        formatters = null;
      } finally {
        formattersLoading = null;
      }
    })();

    try {
      await formattersLoading;
    } catch {
      // Ignore errors - will use fallback format
    }
  };

  // Start loading formatters in background
  void loadFormattersAsync();

  const shouldUseAI = format === 'ai' || opts.jsonMode === true;

  const createEntry = (
    level: LogEntry['level'],
    message: string,
    meta?: object
  ): DebugLogEntry => {
    const entry: DebugLogEntry = {
      timestamp: Date.now(),
      namespace,
      level,
      message,
      meta,
      traceId: opts.traceId,
      spanId: opts.spanId,
      parentSpanId: opts.parentSpanId,
      group: currentGroup,
      groupDepth,
    };
    return entry;
  };

  const formatEntry = (entry: DebugLogEntry): string => {
    // Use formatters if loaded
    if (formatters) {
      if (shouldUseAI) {
        return formatters.formatDebugEntryAI(entry);
      }
      return formatters.formatDebugEntryHuman(entry, {
        showTimestamp: detailLevel !== 'debug',
        showDuration: entry.duration !== undefined,
      });
    }

    // Fallback: if formatters not loaded yet (first few logs), use simple format
    // This is temporary - formatters load very quickly in background
    // In production, this should rarely happen as formatters load before first log
    return formatLogEntry(entry, actuallyEnabled);
  };

  const log = (level: LogEntry['level'], message: string, meta?: object): void => {
    if (!actuallyEnabled) {return;}
    
    const entry = createEntry(level, message, meta);
    entries.push(entry);
    
    const formatted = formatEntry(entry);
    if (formatted) {
      // Use appropriate console method
      switch (level) {
        case 'error':
          console.error(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        case 'info':
        case 'debug':
        default:
          console.log(formatted);
          break;
      }
    }
  };

  const logLazy = (level: LogEntry['level'], getMessage: () => string, meta?: object): void => {
    if (!actuallyEnabled) {return;}
    
    // Only compute message if actually logging
    const message = getMessage();
    log(level, message, meta);
  };
  
  return {
    debug: (message: string, meta?: object) => log('debug', message, meta),
    info: (message: string, meta?: object) => log('info', message, meta),
    warn: (message: string, meta?: object) => log('warn', message, meta),
    error: (message: string, meta?: object) => log('error', message, meta),
    
    debugLazy: (getMessage: () => string, meta?: object) => logLazy('debug', getMessage, meta),
    
    getEntries: () => [...entries],
    clearEntries: () => entries.length = 0,
    
    group: (name: string) => {
      if (actuallyEnabled) {
        groupDepth++;
        currentGroup = name;
        if (!shouldUseAI) {
          console.group(`[${namespace}] ${name}`);
        }
      }
    },
    
    groupEnd: () => {
      if (actuallyEnabled && groupDepth > 0) {
        groupDepth--;
        if (groupDepth === 0) {
          currentGroup = undefined;
        }
        if (!shouldUseAI) {
          console.groupEnd();
        }
      }
    },
    
    time: (label: string) => {
      if (actuallyEnabled) {
        timers.set(label, Date.now());
      }
    },
    
    timeEnd: (label: string) => {
      if (actuallyEnabled) {
        const start = timers.get(label);
        if (start !== undefined) {
          const duration = Date.now() - start;
          const entry = createEntry('debug', `${label}: ${duration}ms`);
          entry.duration = duration;
          entries.push(entry);
          
          const formatted = formatEntry(entry);
          if (formatted) {
            console.log(formatted);
          }
          timers.delete(label);
        }
      }
    },
  };
}


