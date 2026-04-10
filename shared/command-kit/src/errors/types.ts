/**
 * @module @kb-labs/shared-command-kit/errors/types
 * Types for error formatting
 */

/**
 * Formatted error result
 */
export interface FormattedError {
  /** Human-readable error message */
  message: string;
  /** JSON representation */
  json: {
    ok: false;
    error: string;
    timingMs?: number;
    stack?: string;
  };
}

/**
 * Error formatting options
 */
export interface FormatErrorOptions {
  /** Output in JSON format */
  jsonMode?: boolean;
  /** Include stack trace */
  showStack?: boolean;
  /** Timing information */
  timingMs?: number;
}

