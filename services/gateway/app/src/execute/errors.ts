/**
 * @module gateway-app/execute/errors
 *
 * Shared error types for execution pipeline.
 */

import type { CancellationReason } from '@kb-labs/core-contracts';

/**
 * Thrown when an execution is cancelled (CC2).
 * Caught by routes.ts to emit execution:cancelled + execution:done(130).
 */
export class CancelledError extends Error {
  readonly reason: CancellationReason;

  constructor(reason: CancellationReason) {
    super(`Execution cancelled: ${reason}`);
    this.name = 'CancelledError';
    this.reason = reason;
  }
}
