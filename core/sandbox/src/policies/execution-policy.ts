/**
 * @module @kb-labs/core-sandbox/policies/execution-policy
 * Timeout and grace period management
 */

import type { ChildProcess } from 'node:child_process';

/**
 * Start timeout watch for a child process
 * @param child - Child process
 * @param timeoutMs - Timeout in milliseconds
 * @param graceMs - Grace period for SIGTERM (default: 5000ms)
 * @returns Timeout handle
 */
export function startTimeoutWatch(
  child: ChildProcess,
  timeoutMs: number,
  graceMs: number = 5000
): NodeJS.Timeout {
  let sigtermSent = false;

  return setTimeout(() => {
    if (!sigtermSent) {
      sigtermSent = true;
      child.kill('SIGTERM');
      
      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, graceMs);
    }
  }, timeoutMs);
}

/**
 * Clear timeout watch
 * @param timeoutHandle - Timeout handle to clear
 */
export function clearTimeoutWatch(timeoutHandle: NodeJS.Timeout): void {
  clearTimeout(timeoutHandle);
}

