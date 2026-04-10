/**
 * @module @kb-labs/plugin-execution/utils
 *
 * Utility functions for execution layer.
 */

import { randomBytes } from 'node:crypto';
import type { ExecutionError, ExecutionErrorCode } from './types.js';
import { TimeoutError, AbortError, isExecutionLayerError, isKnownErrorCode } from './errors.js';

/**
 * Create unique execution ID.
 * Format: exec_{pid}_{timestamp}_{random}
 *
 * Includes pid for easier tracing on same machine.
 *
 * @example "exec_12345_1703088000000_a1b2c3d4"
 */
export function createExecutionId(): string {
  const pid = process.pid;
  const timestamp = Date.now();
  const random = randomBytes(4).toString('hex');
  return `exec_${pid}_${timestamp}_${random}`;
}

/**
 * Create promise that rejects after timeout.
 *
 * IMPORTANT:
 * - Uses TimeoutError/AbortError from errors.ts (not generic Error)
 * - Cleans up event listener on abort signal to prevent memory leaks
 */
export function createTimeoutPromise(
  timeoutMs: number,
  signal?: AbortSignal
): Promise<never> {
  return new Promise((_, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | undefined;

    // Cleanup function
    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (signal && abortHandler) {
        signal.removeEventListener('abort', abortHandler);
        abortHandler = undefined;
      }
    };

    // Timer handler
    timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError(`Timeout after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);

    // Abort handler (if signal provided)
    if (signal) {
      // Check if already aborted
      if (signal.aborted) {
        cleanup();
        reject(new AbortError('Execution aborted'));
        return;
      }

      abortHandler = () => {
        cleanup();
        reject(new AbortError('Execution aborted'));
      };
      signal.addEventListener('abort', abortHandler);
    }
  });
}

/**
 * Normalize any error to ExecutionError interface.
 *
 * - For ExecutionLayerError: uses toJSON()
 * - For other errors: extracts message/stack, validates code
 * - For non-errors: converts to string
 *
 * Returns strictly typed ExecutionError (interface).
 */
export function normalizeError(error: unknown): ExecutionError {
  // ExecutionLayerError: use toJSON()
  if (isExecutionLayerError(error)) {
    return error.toJSON();
  }

  // Standard Error: extract fields
  if (error instanceof Error) {
    const anyError = error as Error & { code?: unknown; details?: unknown };

    // Validate and clamp error code
    const rawCode = anyError.code;
    const code: ExecutionErrorCode = isKnownErrorCode(rawCode)
      ? rawCode
      : 'HANDLER_ERROR';

    return {
      message: error.message,
      code,
      stack: error.stack,
      details: typeof anyError.details === 'object' && anyError.details !== null
        ? anyError.details as Record<string, unknown>
        : undefined,
    };
  }

  // Non-error: convert to string
  return {
    message: String(error),
    code: 'UNKNOWN_ERROR',
  };
}

/**
 * Normalize HTTP headers from Fastify format.
 *
 * Fastify headers can be:
 * - string
 * - string[] (multiple values)
 * - undefined
 *
 * This normalizes to Record<string, string> by joining arrays with comma.
 */
export function normalizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {continue;}

    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    } else {
      result[key] = value;
    }
  }

  return result;
}
