/**
 * Error types for V3 Plugin System
 *
 * Standardized errors with codes for proper handling across IPC boundaries.
 */

/**
 * Base plugin error class
 */
export class PluginError extends Error {
  /**
   * Error code for programmatic handling
   */
  public readonly code: string;

  /**
   * Additional error details
   */
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PluginError';
    this.code = code;
    this.details = details;

    // Ensure prototype chain is correct
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert to JSON-serializable object (for IPC)
   */
  toJSON(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Create from serialized error (from IPC)
   */
  static fromJSON(data: SerializedError): PluginError {
    const error = new PluginError(data.message, data.code, data.details);
    error.stack = data.stack;
    return error;
  }
}

/**
 * Permission denied error
 */
export class PermissionError extends PluginError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', details);
    this.name = 'PermissionError';
  }
}

/**
 * Operation timeout error
 */
export class TimeoutError extends PluginError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'TIMEOUT', details);
    this.name = 'TimeoutError';
  }
}

/**
 * Operation aborted error (e.g., by signal)
 */
export class AbortError extends PluginError {
  constructor(message: string = 'Operation aborted') {
    super(message, 'ABORTED');
    this.name = 'AbortError';
  }
}

/**
 * Configuration error
 */
export class ConfigError extends PluginError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', details);
    this.name = 'ConfigError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends PluginError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends PluginError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends PluginError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfterMs?: number
  ) {
    super(message, 'RATE_LIMIT', { retryAfterMs });
    this.name = 'RateLimitError';
  }
}

/**
 * Platform service error (e.g., LLM, cache, storage)
 */
export class PlatformError extends PluginError {
  constructor(
    public readonly service: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'PLATFORM_ERROR', { service, ...details });
    this.name = 'PlatformError';
  }
}

/**
 * Serialized error for IPC transport
 */
export interface SerializedError {
  name: string;
  message: string;
  code: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * Error codes enum for type safety
 */
export const ErrorCode = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  CONFIG_ERROR: 'CONFIG_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMIT: 'RATE_LIMIT',
  PLATFORM_ERROR: 'PLATFORM_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  IPC_ERROR: 'IPC_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Check if an error is a PluginError
 */
export function isPluginError(error: unknown): error is PluginError {
  return error instanceof PluginError;
}

/**
 * Wrap any error as a PluginError
 */
export function wrapError(error: unknown, defaultCode: string = 'INTERNAL_ERROR'): PluginError {
  if (error instanceof PluginError) {
    return error;
  }

  if (error instanceof Error) {
    return new PluginError(error.message, defaultCode, {
      originalName: error.name,
      stack: error.stack,
    });
  }

  return new PluginError(String(error), defaultCode);
}
