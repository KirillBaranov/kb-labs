/**
 * ID generation utilities
 */

import { randomBytes } from 'node:crypto';

/**
 * Generate a unique ID (16 bytes hex = 32 chars)
 */
export function createId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Generate a short ID (8 bytes hex = 16 chars)
 */
export function createShortId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Extract trace ID from a composite request ID
 * Format: {traceId}:{spanId}
 */
export function extractTraceId(requestId: string): string {
  const colonIndex = requestId.indexOf(':');
  if (colonIndex > 0) {
    return requestId.substring(0, colonIndex);
  }
  return requestId;
}

/**
 * Create a composite request ID from trace and span IDs
 */
export function createRequestId(traceId: string, spanId: string): string {
  return `${traceId}:${spanId}`;
}
