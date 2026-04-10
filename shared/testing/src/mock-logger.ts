/**
 * @module @kb-labs/shared-testing/mock-logger
 *
 * Logger mock with message recording and vi.fn() spies.
 *
 * @example
 * ```typescript
 * const logger = mockLogger();
 * logger.info('hello', { extra: 'data' });
 * logger.error('oops', new Error('fail'));
 *
 * expect(logger.messages).toEqual([
 *   { level: 'info', msg: 'hello', meta: { extra: 'data' } },
 *   { level: 'error', msg: 'oops', error: expect.any(Error), meta: undefined },
 * ]);
 * expect(logger.info).toHaveBeenCalledWith('hello', { extra: 'data' });
 * ```
 */

import { vi } from 'vitest';
import type { ILogger } from '@kb-labs/core-platform';

/** Recorded log entry */
export interface LogEntry {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  msg: string;
  error?: Error;
  meta?: Record<string, unknown>;
}

/**
 * Mock logger instance with message recording.
 */
export interface MockLoggerInstance extends ILogger {
  /** All recorded log messages */
  readonly messages: LogEntry[];
  /** Reset messages and spy call history */
  reset: () => void;
}

/**
 * Create a mock logger with message recording.
 *
 * All log methods are vi.fn() spies. Messages are collected
 * into a `.messages` array for easy assertion.
 *
 * Child loggers share the same messages array.
 *
 * @example
 * ```typescript
 * const logger = mockLogger();
 * const child = logger.child({ module: 'auth' });
 *
 * child.info('user logged in');
 * expect(logger.messages).toHaveLength(1);
 * expect(logger.messages[0].msg).toBe('user logged in');
 * ```
 */
export function mockLogger(sharedMessages?: LogEntry[]): MockLoggerInstance {
  const messages: LogEntry[] = sharedMessages ?? [];

  // trace, debug, info, warn: (message, meta?)
  function createSimpleLogMethod(level: LogEntry['level']) {
    return vi.fn((msg: string, meta?: Record<string, unknown>) => {
      messages.push({ level, msg, meta });
    });
  }

  // error, fatal: (message, error?, meta?)
  function createErrorLogMethod(level: 'error' | 'fatal') {
    return vi.fn((msg: string, error?: Error, meta?: Record<string, unknown>) => {
      messages.push({ level, msg, error, meta });
    });
  }

  const instance: MockLoggerInstance = {
    trace: createSimpleLogMethod('trace'),
    debug: createSimpleLogMethod('debug'),
    info: createSimpleLogMethod('info'),
    warn: createSimpleLogMethod('warn'),
    error: createErrorLogMethod('error'),
    fatal: createErrorLogMethod('fatal'),
    child: (_bindings?: Record<string, unknown>) => mockLogger(messages),
    get messages() { return messages; },
    reset: () => {
      messages.length = 0;
      (instance.trace as ReturnType<typeof vi.fn>).mockClear();
      (instance.debug as ReturnType<typeof vi.fn>).mockClear();
      (instance.info as ReturnType<typeof vi.fn>).mockClear();
      (instance.warn as ReturnType<typeof vi.fn>).mockClear();
      (instance.error as ReturnType<typeof vi.fn>).mockClear();
      (instance.fatal as ReturnType<typeof vi.fn>).mockClear();
    },
  };

  return instance;
}
