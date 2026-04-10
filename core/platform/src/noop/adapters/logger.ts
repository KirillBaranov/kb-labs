/**
 * @module @kb-labs/core-platform/noop/adapters/logger
 * Console-based logger implementation.
 */

import type { ILogger } from '../../adapters/logger.js';

/**
 * Log level type.
 */
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Simple console logger with log level support.
 * Respects KB_LOG_LEVEL environment variable.
 * Outputs to console.log/warn/error/debug with JSON metadata.
 */
export class ConsoleLogger implements ILogger {
  private bindings: Record<string, unknown>;
  private level: LogLevel;

  constructor(bindings: Record<string, unknown> = {}, level?: LogLevel) {
    this.bindings = bindings;
    // Read from env or use provided level (default: 'info')
    this.level = level ?? (process.env.KB_LOG_LEVEL as LogLevel) ?? 'info';
  }

  private shouldLog(messageLevel: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      silent: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5,
    };

    const currentLevel = levels[this.level] ?? 3; // Default to info
    const targetLevel = levels[messageLevel] ?? 3;

    return targetLevel <= currentLevel;
  }

  private formatMeta(meta?: Record<string, unknown>): string {
    const combined = { ...this.bindings, ...meta };
    if (Object.keys(combined).length === 0) {
      return '';
    }
    return ' ' + JSON.stringify(combined);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}${this.formatMeta(meta)}`);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}${this.formatMeta(meta)}`);
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorMeta = error
        ? { ...meta, error: { message: error.message, stack: error.stack } }
        : meta;
      console.error(`[ERROR] ${message}${this.formatMeta(errorMeta)}`);
    }
  }

  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const errorMeta = error
        ? { ...meta, error: { message: error.message, stack: error.stack } }
        : meta;
      console.error(`[FATAL] ${message}${this.formatMeta(errorMeta)}`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.debug(`[DEBUG] ${message}${this.formatMeta(meta)}`);
    }
  }

  trace(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog('trace')) {
      console.debug(`[TRACE] ${message}${this.formatMeta(meta)}`);
    }
  }

  child(bindings: Record<string, unknown>): ILogger {
    // Child logger inherits parent's level
    return new ConsoleLogger({ ...this.bindings, ...bindings }, this.level);
  }
}

/**
 * Silent logger that does nothing.
 * Useful for tests where you want to suppress all logging.
 */
export class NoOpLogger implements ILogger {
  info(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  warn(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  error(_message: string, _error?: Error, _meta?: Record<string, unknown>): void {
    // No-op
  }

  fatal(_message: string, _error?: Error, _meta?: Record<string, unknown>): void {
    // No-op
  }

  debug(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  trace(_message: string, _meta?: Record<string, unknown>): void {
    // No-op
  }

  child(_bindings: Record<string, unknown>): ILogger {
    return this;
  }
}
