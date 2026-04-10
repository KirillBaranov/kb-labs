/**
 * @module @kb-labs/core-sandbox/cancellation/abort-controller
 * AbortSignal support for cancellation
 */

/**
 * Create an AbortSignal that aborts after specified timeout
 * @param timeoutMs - Timeout in milliseconds
 * @returns AbortSignal that will abort after timeout
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  // Cleanup timeout on abort
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeout);
  });
  
  return controller.signal;
}





