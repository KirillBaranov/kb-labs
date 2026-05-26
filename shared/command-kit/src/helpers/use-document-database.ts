/**
 * @module @kb-labs/shared-command-kit/helpers/use-document-database
 *
 * Hook for the per-plugin document database — structured persistence with
 * filters, transactions, and indexed collections.
 *
 * The adapter is resolved from the current `usePlatform()` context, so the
 * instance you receive is already wrapped with this plugin's permissions:
 * collection names are namespaced under `<pluginId>__<name>`, and any call
 * to a collection the plugin didn't declare in
 * `permissions.platform.database.document.owns` / `.access` rejects with
 * `PermissionError`.
 *
 * @example
 * ```typescript
 * import { useDocumentDatabase } from '@kb-labs/shared-command-kit';
 *
 * interface Run extends BaseDocument {
 *   status: 'queued' | 'running' | 'done';
 *   startedAt: number;
 * }
 *
 * async function handler() {
 *   const docs = useDocumentDatabase();
 *   if (!docs) {
 *     throw new Error('Plugin needs documentDatabase configured');
 *   }
 *
 *   await docs.ensureCollection('runs', {
 *     indexes: [{ path: 'status' }],
 *   });
 *
 *   const queued = await docs.find<Run>('runs', { status: { $eq: 'queued' } });
 *   return queued;
 * }
 * ```
 */

import type { IDocumentDatabase } from '@kb-labs/core-platform';
import { usePlatform } from './use-platform.js';

/**
 * Resolve the document database for the current execution.
 *
 * Returns `undefined` when no adapter is configured at all. When a plugin
 * declared permissions but is missing the wiring (NoOp adapter on the
 * platform side) you still get an instance — calls just throw on use.
 *
 * Always check before using:
 *
 * ```ts
 * const docs = useDocumentDatabase();
 * if (!docs) {
 *   // The platform was started without a document database;
 *   // either skip the feature or fail fast with a clear error.
 *   return;
 * }
 * ```
 */
export function useDocumentDatabase(): IDocumentDatabase | undefined {
  const platform = usePlatform();
  return platform.documentDatabase;
}

/**
 * Cheap check for "is the document database available?". Returns true even
 * for NoOp adapters configured by the platform — use this to gate optional
 * features, not as a security check.
 */
export function isDocumentDatabaseAvailable(): boolean {
  return useDocumentDatabase() !== undefined;
}
