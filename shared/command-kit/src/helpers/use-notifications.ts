/**
 * @module @kb-labs/shared-command-kit/helpers/use-notifications
 * Platform notifier access helper.
 *
 * @example
 * ```typescript
 * import { useNotifications } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   const notifier = useNotifications();
 *   await notifier?.notify({ title: 'Done', body: 'Workflow complete', severity: 'info' });
 * }
 * ```
 */

import { usePlatform } from './use-platform';
import type { INotifier } from '@kb-labs/core-platform';

/**
 * Access the platform notifier adapter.
 * Returns undefined if the notifier adapter is not configured.
 *
 * @example
 * ```typescript
 * const notifier = useNotifications();
 * if (notifier) {
 *   await notifier.notify({ title: 'Alert', body: 'Something failed', severity: 'critical' });
 * }
 * ```
 */
export function useNotifications(): INotifier | undefined {
  const platform = usePlatform();
  return platform.notifier;
}
