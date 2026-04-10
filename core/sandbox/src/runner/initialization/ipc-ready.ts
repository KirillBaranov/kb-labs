/**
 * @module @kb-labs/core-sandbox/runner/initialization/ipc-ready
 * Send READY signal to parent process via IPC
 */

/**
 * Signal readiness to parent process
 *
 * CRITICAL: This must happen synchronously at module load time
 * Parent process is waiting for this message with a timeout
 *
 * If this signal is not sent, parent will timeout and kill the subprocess
 */
export function sendReadySignal(): void {
  if (!process.send) {
    // If IPC is not available, log to stderr and exit
    // This is a critical error - parent will see exit code
    console.error('CRITICAL: process.send is not available, cannot send READY signal');
    process.exit(1);
  }

  try {
    process.send({ type: 'READY' });
  } catch (error) {
    // If IPC fails, log to stderr (can't use Output yet - not initialized)
    // This is a critical error - parent will timeout
    console.error(`CRITICAL: Failed to send READY: ${error}`);
    // Exit immediately - parent will see exit code
    process.exit(1);
  }
}
