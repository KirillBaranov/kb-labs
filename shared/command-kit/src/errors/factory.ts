/**
 * Error Factory for KB Labs Plugins
 *
 * Optional helper for defining plugin errors without boilerplate.
 * You can always use standard Error classes - this is just convenience.
 *
 * @example
 * ```typescript
 * import { defineError } from '@kb-labs/shared-command-kit';
 *
 * export const MindError = defineError('MIND', {
 *   ValidationFailed: { code: 400, message: 'Validation failed' },
 *   IndexNotFound: { code: 404, message: (scope: string) => `Index '${scope}' not found` },
 *   QueryFailed: { code: 500, message: 'Query execution failed' },
 * });
 *
 * // Usage:
 * throw new MindError.IndexNotFound('default');
 * throw new MindError.ValidationFailed({ details: { field: 'cwd' } });
 * ```
 */

/**
 * Error definition with HTTP code and message
 */
export interface ErrorDefinition {
  /** HTTP status code (400, 404, 500, etc.) */
  code: number;
  /** Error message - can be string or function for parameterized messages */
  message: string | ((...args: any[]) => string);
  /** Optional additional details */
  details?: Record<string, unknown>;
}

/**
 * Error definitions map
 */
export type ErrorDefinitions = Record<string, ErrorDefinition>;

/**
 * Base error class with HTTP status code support
 */
export class PluginError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    errorCode: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PluginError';
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginError);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON() {
    return {
      name: this.name,
      errorCode: this.errorCode,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Check if error is a PluginError
   */
  static isPluginError(error: unknown): error is PluginError {
    return error instanceof PluginError;
  }
}

/**
 * Type for error constructor created by defineError
 */
type ErrorConstructor<TArgs extends any[] = any[]> = {
  new (details?: Record<string, unknown>): PluginError;
  new (...args: TArgs): PluginError;
};

/**
 * Type for error namespace created by defineError
 */
type ErrorNamespace<TDefs extends ErrorDefinitions> = {
  [K in keyof TDefs]: ErrorConstructor;
} & {
  /** Check if error is from this namespace */
  is(error: unknown): error is PluginError;
  /** Check if error has specific error code */
  hasCode(error: unknown, code: keyof TDefs): boolean;
};

/**
 * Define a namespace of plugin errors
 *
 * @param prefix - Error code prefix (e.g., 'MIND', 'WORKFLOW')
 * @param definitions - Error definitions map
 * @returns Error namespace with error constructors
 *
 * @example
 * ```typescript
 * export const MindError = defineError('MIND', {
 *   IndexNotFound: {
 *     code: 404,
 *     message: (scope: string) => `Index '${scope}' not found`
 *   },
 *   QueryFailed: {
 *     code: 500,
 *     message: 'Query execution failed'
 *   },
 * });
 *
 * // Throw with template params
 * throw new MindError.IndexNotFound('default');
 * // Error message: "Index 'default' not found"
 *
 * // Throw with details
 * throw new MindError.QueryFailed({
 *   details: { query: 'test', reason: 'timeout' }
 * });
 * ```
 */
export function defineError<TDefs extends ErrorDefinitions>(
  prefix: string,
  definitions: TDefs
): ErrorNamespace<TDefs> {
  const errorNamespace: any = {};

  // Create error constructor for each definition
  for (const [key, def] of Object.entries(definitions)) {
    const errorCode = `${prefix}_${key.toUpperCase()}`;

    // Create error class
    class DefinedError extends PluginError {
      constructor(...args: any[]) {
        const { message, details } = buildMessageAndDetails(def, args);
        super(errorCode, message, def.code, details);
        this.name = `${prefix}Error`;
      }
    }

    errorNamespace[key] = DefinedError;
  }

  // Add helper methods
  errorNamespace.is = (error: unknown): error is PluginError => {
    return PluginError.isPluginError(error) && error.errorCode.startsWith(prefix + '_');
  };

  errorNamespace.hasCode = (error: unknown, code: keyof TDefs): boolean => {
    const errorCode = `${prefix}_${String(code).toUpperCase()}`;
    return PluginError.isPluginError(error) && error.errorCode === errorCode;
  };

  return errorNamespace as ErrorNamespace<TDefs>;
}

/**
 * Build error message and details from definition and constructor args
 */
function buildMessageAndDetails(
  def: ErrorDefinition,
  args: any[]
): { message: string; details?: Record<string, unknown> } {
  let message: string;
  let details: Record<string, unknown> | undefined;

  if (typeof def.message === 'function') {
    // Template message - args are template params
    const lastArg = args[args.length - 1];

    // Check if last arg is details object (has 'details' key)
    const hasDetails = lastArg && typeof lastArg === 'object' && 'details' in lastArg;

    if (hasDetails) {
      // Last arg is details, rest are template params
      const templateArgs = args.slice(0, -1);
      message = def.message(...templateArgs);
      details = { ...def.details, ...lastArg.details };
    } else {
      // All args are template params
      message = def.message(...args);
      details = def.details;
    }
  } else {
    // Static message
    message = def.message;

    // First arg can be details object
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      details = { ...def.details, ...args[0].details };
    } else {
      details = def.details;
    }
  }

  return { message, details };
}

/**
 * Common error definitions that can be reused across plugins
 */
export const commonErrors = {
  /**
   * Validation error (400)
   */
  ValidationFailed: {
    code: 400,
    message: 'Validation failed',
  },

  /**
   * Resource not found (404)
   */
  NotFound: {
    code: 404,
    message: (resource: string) => `${resource} not found`,
  },

  /**
   * Unauthorized access (401)
   */
  Unauthorized: {
    code: 401,
    message: 'Unauthorized',
  },

  /**
   * Forbidden access (403)
   */
  Forbidden: {
    code: 403,
    message: 'Forbidden',
  },

  /**
   * Internal server error (500)
   */
  InternalError: {
    code: 500,
    message: 'Internal server error',
  },

  /**
   * Service unavailable (503)
   */
  ServiceUnavailable: {
    code: 503,
    message: (service: string) => `Service '${service}' is unavailable`,
  },

  /**
   * Timeout error (504)
   */
  Timeout: {
    code: 504,
    message: (operation: string) => `Operation '${operation}' timed out`,
  },

  /**
   * Conflict error (409)
   */
  Conflict: {
    code: 409,
    message: (resource: string) => `${resource} already exists`,
  },
} satisfies ErrorDefinitions;
