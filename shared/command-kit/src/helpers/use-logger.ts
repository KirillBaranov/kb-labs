/**
 * @module @kb-labs/shared-command-kit/helpers/use-logger
 * Global logger access helper
 *
 * Provides clean access to structured logging without context drilling.
 *
 * @example
 * ```typescript
 * import { useLogger } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   const logger = useLogger();
 *
 *   await logger.info('Processing started');
 *   await logger.debug('Details', { userId: 123 });
 *   await logger.error('Failed', { error: err });
 * }
 * ```
 */

import { usePlatform } from './use-platform';
import type { ILogger } from '@kb-labs/core-platform';

/**
 * Access global logger
 *
 * Returns the platform logger with structured logging capabilities.
 * Supports child loggers with additional context.
 *
 * **Methods:**
 * - `logger.trace(message, meta?)` - Trace-level logs (most verbose)
 * - `logger.debug(message, meta?)` - Debug-level logs
 * - `logger.info(message, meta?)` - Info-level logs
 * - `logger.warn(message, meta?)` - Warning-level logs
 * - `logger.error(message, meta?)` - Error-level logs
 * - `logger.child(meta)` - Create child logger with additional context
 *
 * @returns Platform logger instance
 *
 * @example
 * ```typescript
 * const logger = useLogger();
 *
 * await logger.info('Task started', { taskId: '123' });
 * await logger.error('Task failed', { taskId: '123', error: err.message });
 *
 * // Child logger with persistent context
 * const taskLogger = logger.child({ taskId: '123', userId: 'user-1' });
 * await taskLogger.info('Step 1 completed');
 * await taskLogger.info('Step 2 completed');
 * ```
 */
export function useLogger(): ILogger {
  const platform = usePlatform();
  return platform.logger;
}

/**
 * Create child logger with additional context
 *
 * Useful for scoped logging within a specific operation.
 *
 * @param context - Additional context to attach to all log entries
 * @returns Child logger with persistent context
 *
 * @example
 * ```typescript
 * const logger = useLoggerWithContext({ operation: 'release', version: '1.0.0' });
 *
 * await logger.info('Started');  // Automatically includes operation + version
 * await logger.info('Completed');
 * ```
 */
export function useLoggerWithContext(context: Record<string, unknown>): ILogger {
  const logger = useLogger();
  return logger.child(context);
}
