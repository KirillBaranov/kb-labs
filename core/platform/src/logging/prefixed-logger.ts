/**
 * @module @kb-labs/core-platform/logging/prefixed-logger
 *
 * Prefixed logger wrapper that prevents plugins from overriding system observability fields.
 *
 * ## Problem
 *
 * When plugins call `ctx.platform.logger.child({ reqId: 'custom' })`, they can accidentally
 * override system observability fields like `reqId`, `traceId`, `tenantId`, etc.
 *
 * ## Solution
 *
 * This wrapper automatically renames conflicting fields by adding a `plugin_` prefix:
 * - `reqId` → `plugin_reqId`
 * - `traceId` → `plugin_traceId`
 * - etc.
 *
 * Non-conflicting fields pass through unchanged.
 *
 * ## Example
 *
 * ```typescript
 * const baseLogger = platform.logger.child({ reqId: 'req-123', traceId: 'trace-456' });
 * const prefixed = createPrefixedLogger(baseLogger);
 *
 * // Plugin tries to override system fields
 * const pluginLogger = prefixed.child({ reqId: 'custom', userId: '789' });
 * pluginLogger.info('test');
 *
 * // Result:
 * {
 *   reqId: 'req-123',           // ← System field preserved
 *   plugin_reqId: 'custom',     // ← Plugin field renamed
 *   userId: '789',              // ← Non-conflicting field unchanged
 *   msg: 'test'
 * }
 * ```
 */

import type { ILogger } from '../adapters/logger.js';

/**
 * System observability fields that should not be overridden by plugins.
 *
 * These fields are set by the platform based on hostContext and should remain
 * immutable throughout the plugin execution lifecycle.
 */
export const SYSTEM_LOG_FIELDS = new Set([
  // Core observability
  'reqId',
  'requestId',
  'traceId',
  'spanId',
  'parentSpanId',
  'invocationId',
  'executionId',
  'tenantId',
  'layer',

  // REST context
  'method',
  'url',

  // Workflow context
  'workflowId',
  'runId',
  'stepId',
  'jobId',
  'attempt',

  // Webhook context
  'event',
  'source',

  // Cron context
  'cronId',
  'schedule',
  'scheduledAt',
  'lastRunAt',
]);

/**
 * Create a prefixed logger that renames conflicting fields.
 *
 * @param baseLogger - Base logger instance
 * @param options - Configuration options
 * @returns Wrapped logger with field prefixing
 *
 * @example
 * ```typescript
 * const enrichedLogger = platform.logger.child({ reqId: 'req-123' });
 * const prefixed = createPrefixedLogger(enrichedLogger);
 *
 * // Plugins can't override system fields
 * const userLogger = prefixed.child({ reqId: 'custom', foo: 'bar' });
 * // → { reqId: 'req-123', plugin_reqId: 'custom', foo: 'bar' }
 * ```
 */
export function createPrefixedLogger(
  baseLogger: ILogger,
  options: {
    /** Prefix for renamed fields (default: 'plugin_') */
    prefix?: string;
    /** Warn in development when renaming fields (default: true) */
    warnOnRename?: boolean;
    /** Custom set of protected fields (default: SYSTEM_LOG_FIELDS) */
    protectedFields?: Set<string>;
  } = {}
): ILogger {
  const {
    prefix = 'plugin_',
    warnOnRename = true,
    protectedFields = SYSTEM_LOG_FIELDS,
  } = options;

  return {
    // Proxy all log methods (defensive check for bind)
    trace: baseLogger.trace?.bind ? baseLogger.trace.bind(baseLogger) : baseLogger.trace,
    debug: baseLogger.debug?.bind ? baseLogger.debug.bind(baseLogger) : baseLogger.debug,
    info: baseLogger.info?.bind ? baseLogger.info.bind(baseLogger) : baseLogger.info,
    warn: baseLogger.warn?.bind ? baseLogger.warn.bind(baseLogger) : baseLogger.warn,
    error: baseLogger.error?.bind ? baseLogger.error.bind(baseLogger) : baseLogger.error,
    fatal: baseLogger.fatal?.bind ? baseLogger.fatal.bind(baseLogger) : baseLogger.fatal,

    // Proxy optional log buffer
    getLogBuffer: baseLogger.getLogBuffer?.bind ? baseLogger.getLogBuffer.bind(baseLogger) : baseLogger.getLogBuffer,

    // Wrap child() to add prefixing
    child(fields: Record<string, unknown>): ILogger {
      const prefixed: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(fields)) {
        if (protectedFields.has(key)) {
          // Rename with prefix
          const newKey = `${prefix}${key}`;
          prefixed[newKey] = value;

          // Warn in development
          if (warnOnRename && process.env.NODE_ENV !== 'production') {
            console.warn(
              `[Logger] Field "${key}" is reserved for system observability. ` +
              `Renamed to "${newKey}".`
            );
          }
        } else {
          // Pass through unchanged
          prefixed[key] = value;
        }
      }

      // Recursively wrap child loggers
      return createPrefixedLogger(baseLogger.child(prefixed), options);
    },
  };
}
