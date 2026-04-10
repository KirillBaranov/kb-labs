/**
 * @module @kb-labs/core-sandbox/runner/initialization/logging-setup
 * Subprocess logging initialization - ensures KB_LOG_LEVEL from parent is respected
 */

import type { Logger } from '../../types/adapter-context';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

class NoOpLogger implements Logger {
  info(_message: string, _meta?: Record<string, unknown>): void {}
  warn(_message: string, _meta?: Record<string, unknown>): void {}
  error(_message: string, _error?: Error, _meta?: Record<string, unknown>): void {}
  debug(_message: string, _meta?: Record<string, unknown>): void {}
  child(_bindings: Record<string, unknown>): Logger {
    return this;
  }
}

class ConsoleLogger implements Logger {
  constructor(
    private readonly level: LogLevel,
    private readonly bindings: Record<string, unknown> = {}
  ) {}

  private canLog(target: LogLevel): boolean {
    const rank: Record<LogLevel, number> = {
      silent: 0,
      error: 1,
      warn: 2,
      info: 3,
      debug: 4,
      trace: 5,
    };
    return rank[target] <= rank[this.level];
  }

  private withMeta(meta?: Record<string, unknown>): string {
    const merged = { ...this.bindings, ...(meta ?? {}) };
    return Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : '';
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.canLog('info')) {
      console.log(`[INFO] ${message}${this.withMeta(meta)}`);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.canLog('warn')) {
      console.warn(`[WARN] ${message}${this.withMeta(meta)}`);
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.canLog('error')) {
      const errorMeta = error ? { ...meta, error: { message: error.message, stack: error.stack } } : meta;
      console.error(`[ERROR] ${message}${this.withMeta(errorMeta)}`);
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.canLog('debug')) {
      console.debug(`[DEBUG] ${message}${this.withMeta(meta)}`);
    }
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.bindings, ...bindings });
  }
}

/**
 * Subprocess logger instance (singleton)
 * Created once during subprocess initialization
 */
let subprocessLogger: Logger | undefined;

/**
 * Flag to prevent re-initialization
 */
let isInitialized = false;

export interface SubprocessLoggingOptions {
  /**
   * Enforce log level - prevent re-initialization with different settings
   * This ensures subprocess respects parent's KB_LOG_LEVEL (security requirement)
   */
  enforceLevel?: boolean;
}

/**
 * Initialize subprocess logging system
 *
 * CRITICAL: This must be called BEFORE any other initialization in bootstrap.ts
 * to ensure logging is configured with parent's KB_LOG_LEVEL before any code runs.
 *
 * Parent-Subprocess Contract:
 * - Parent (bin.ts/CLI bootstrap) sets KB_LOG_LEVEL in environment
 * - Subprocess inherits KB_LOG_LEVEL via process.env
 * - This function reads KB_LOG_LEVEL and initializes logging ONCE
 * - enforceLevel=true prevents re-initialization (parent dictates)
 *
 * @param options - Logging configuration options
 * @returns Object with getSubprocessLogger function
 */
export function initializeSubprocessLogging(options: SubprocessLoggingOptions = {}) {
  // If already initialized and enforceLevel is true, return existing logger
  if (isInitialized && options.enforceLevel) {
    return { getSubprocessLogger: () => subprocessLogger! };
  }

  // Read KB_LOG_LEVEL from parent (inherited via environment)
  const rawLevel = (process.env.KB_LOG_LEVEL || 'silent').toLowerCase();
  const isQuiet = process.env.KB_QUIET === 'true';
  const level: LogLevel =
    rawLevel === 'trace' || rawLevel === 'debug' || rawLevel === 'info' || rawLevel === 'warn' || rawLevel === 'error' || rawLevel === 'silent'
      ? rawLevel
      : 'silent';

  // Use platform-compatible logger implementations only.
  if (isQuiet || level === 'silent') {
    subprocessLogger = new NoOpLogger();
  } else {
    subprocessLogger = new ConsoleLogger(level, { layer: 'sandbox' }).child({
      category: 'subprocess',
    });
  }
  isInitialized = true;

  // If enforceLevel is true, any future calls to initializeSubprocessLogging
  // will return the existing logger without re-initializing
  // This ensures subprocess cannot override parent's KB_LOG_LEVEL

  return {
    /**
     * Get subprocess logger instance
     * Safe to call multiple times - returns same instance
     */
    getSubprocessLogger: () => subprocessLogger!,
  };
}
