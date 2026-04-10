/**
 * Lifecycle API implementation
 */

import type { LifecycleAPI, CleanupFn, Logger } from '@kb-labs/plugin-contracts';

/**
 * Create LifecycleAPI with cleanup stack
 */
export function createLifecycleAPI(
  cleanupStack: Array<CleanupFn>
): LifecycleAPI {
  return {
    onCleanup(fn: CleanupFn): void {
      cleanupStack.push(fn);
    },
  };
}

/**
 * Execute cleanup functions in LIFO order
 */
export async function executeCleanup(
  cleanupStack: Array<CleanupFn>,
  logger: Logger,
  timeoutMs = 5000
): Promise<void> {
  // Execute in reverse order (LIFO)
  const reversed = [...cleanupStack].reverse();

  for (const cleanup of reversed) {
    try {
      await Promise.race([
        cleanup(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Cleanup timeout')), timeoutMs);
        }),
      ]);
    } catch (error) {
      logger.warn('Cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
