/**
 * @module @kb-labs/core-contracts/cancellation
 *
 * Cancellation types for execution pipeline (CC2).
 * Covers: user cancel, timeout, disconnect, system-level cancel.
 */

/**
 * Reason for cancellation.
 */
export type CancellationReason = 'user' | 'timeout' | 'disconnect' | 'system';

/**
 * Cancel request — sent by client or system.
 */
export interface CancelRequest {
  executionId: string;
  reason: CancellationReason;
  /** Who initiated (connectionId, userId, "system") */
  initiator?: string;
}

/**
 * Handler for cancellation at any level (Gateway, Backend, Host Agent).
 */
export interface ICancellationHandler {
  /** Cancel an execution. Returns true if successfully cancelled. */
  cancel(request: CancelRequest): Promise<boolean>;
}
