/**
 * @module @kb-labs/core-sandbox/errors/handler-error
 * Unified error handling for handler execution
 */

/**
 * Standardized error codes for handler execution
 */
export enum HandlerErrorCode {
  HANDLER_CRASHED = 'HANDLER_CRASHED',
  HANDLER_TIMEOUT = 'HANDLER_TIMEOUT',
  HANDLER_VALIDATION_FAILED = 'HANDLER_VALIDATION_FAILED',
  HANDLER_PERMISSION_DENIED = 'HANDLER_PERMISSION_DENIED',
  HANDLER_NOT_FOUND = 'HANDLER_NOT_FOUND',
  HANDLER_CANCELLED = 'HANDLER_CANCELLED',
}

/**
 * Normalized handler error structure
 */
export interface HandlerError {
  code: HandlerErrorCode | string;
  message: string;
  stack?: string;
  details?: Record<string, unknown>;
}

/**
 * Normalize any error to HandlerError format
 * Handles Error objects, strings, and arbitrary objects
 */
export function normalizeError(error: unknown): HandlerError {
  if (error instanceof Error) {
    return {
      code: (error as any).code || HandlerErrorCode.HANDLER_CRASHED,
      message: error.message,
      stack: error.stack,
      details: (error as any).details,
    };
  }
  
  if (typeof error === 'string') {
    return {
      code: HandlerErrorCode.HANDLER_CRASHED,
      message: error,
    };
  }
  
  if (typeof error === 'object' && error !== null) {
    const obj = error as any;
    return {
      code: obj.code || HandlerErrorCode.HANDLER_CRASHED,
      message: obj.message || String(error),
      stack: obj.stack,
      details: obj.details,
    };
  }
  
  return {
    code: HandlerErrorCode.HANDLER_CRASHED,
    message: String(error),
  };
}





