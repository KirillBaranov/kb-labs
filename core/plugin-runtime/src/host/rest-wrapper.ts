/**
 * REST Host Wrapper
 *
 * Transforms RunResult<T> from runner layer into REST-specific response format.
 */

import type { RunResult, ExecutionMeta } from '@kb-labs/plugin-contracts';

/**
 * REST response with optional metadata headers
 */
export interface RestResultWithMeta<T> {
  /**
   * Response data (to be serialized as JSON body)
   */
  data: T;

  /**
   * Headers to add to response
   */
  headers: {
    'X-Plugin-Id': string;
    'X-Plugin-Version': string;
    'X-Request-Id': string;
    'X-Duration-Ms': string;
    [key: string]: string;
  };
}

/**
 * Wrap RunResult from runner into REST-specific response
 *
 * REST handlers return data directly (T), which becomes the response body.
 * Execution metadata is exposed via HTTP headers.
 *
 * @param runResult - Result from runInProcess/runInSubprocess
 * @returns RestResultWithMeta<T> with data and metadata headers
 */
export function wrapRestResult<T>(runResult: RunResult<T>): RestResultWithMeta<T> {
  const { data, executionMeta } = runResult;

  // REST wrapper expects successful result with data
  // Error results should be handled separately by REST layer
  if (!runResult.ok || data === undefined) {
    throw new Error('wrapRestResult called with unsuccessful result or missing data');
  }

  return {
    data,
    headers: buildRestHeaders(executionMeta),
  };
}

/**
 * Build REST metadata headers from execution meta
 */
function buildRestHeaders(meta: ExecutionMeta): RestResultWithMeta<unknown>['headers'] {
  return {
    'X-Plugin-Id': meta.pluginId,
    'X-Plugin-Version': meta.pluginVersion,
    'X-Request-Id': meta.requestId,
    'X-Duration-Ms': String(meta.duration),
    ...(meta.tenantId ? { 'X-Tenant-Id': meta.tenantId } : {}),
    ...(meta.handlerId ? { 'X-Handler-Id': meta.handlerId } : {}),
  };
}

/**
 * Extract just the data from RunResult (simple case)
 *
 * Use when you don't need metadata headers.
 */
export function unwrapRestData<T>(runResult: RunResult<T>): T {
  if (!runResult.ok || runResult.data === undefined) {
    throw new Error('unwrapRestData called with unsuccessful result or missing data');
  }
  return runResult.data;
}
