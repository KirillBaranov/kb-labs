/**
 * @module @kb-labs/shared-command-kit/errors/format
 * Error formatting utilities
 */

import type { FormattedError, FormatErrorOptions } from './types';
import { FlagValidationError } from '../flags/types';
import { formatValidationError } from './format-validation';

/**
 * Format error for display
 * 
 * @example
 * ```typescript
 * const formatted = formatError(error, {
 *   jsonMode: Boolean(flags.json),
 *   showStack: Boolean(flags.debug),
 *   timingMs: tracker.total(),
 * });
 * 
 * if (flags.json) {
 *   ctx.output?.json(formatted.json);
 * } else {
 *   ctx.output?.error(formatted.message);
 * }
 * ```
 */
export function formatError(
  error: unknown,
  options: FormatErrorOptions = {}
): FormattedError {
  const { showStack = false, timingMs } = options;

  // Special handling for FlagValidationError
  if (error instanceof FlagValidationError) {
    const friendlyMessage = formatValidationError(error, {
      commandName: error.commandName,
      schema: error.schema,
    });

    const json: FormattedError['json'] = {
      ok: false,
      error: error.message,
    };

    if (timingMs !== undefined) {
      json.timingMs = timingMs;
    }

    if (showStack && error.stack) {
      json.stack = error.stack;
    }

    let message = friendlyMessage;
    if (showStack && error.stack) {
      message = `${friendlyMessage}\n\nStack trace:\n${error.stack}`;
    }

    return {
      message,
      json,
    };
  }

  // Standard error formatting for other errors
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  const json: FormattedError['json'] = {
    ok: false,
    error: errorMessage,
  };

  if (timingMs !== undefined) {
    json.timingMs = timingMs;
  }

  if (showStack && errorStack) {
    json.stack = errorStack;
  }

  let message = errorMessage;
  if (showStack && errorStack) {
    message = `${errorMessage}\n\n${errorStack}`;
  }

  return {
    message,
    json,
  };
}

