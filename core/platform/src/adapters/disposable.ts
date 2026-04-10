/**
 * @module @kb-labs/core-platform/adapters/disposable
 *
 * Adapter lifecycle interface for graceful shutdown.
 * Adapters that hold OS resources (DB connections, file handles, WAL buffers, timers)
 * should implement this interface to participate in platform.shutdown().
 *
 * PlatformContainer.shutdown() iterates all registered adapters in reverse load order
 * and calls the first available method in this priority: close() → dispose() → shutdown().
 * Implementing IDisposable ensures the adapter is correctly typed for isDisposable() checks
 * used by service-bootstrap observability hooks.
 *
 * @example
 * ```typescript
 * import type { IDisposable } from '@kb-labs/core-platform/adapters';
 *
 * class MyAdapter implements IDisposable {
 *   dispose(): void {
 *     // release file handles, close sockets, etc.
 *   }
 * }
 * ```
 */

/**
 * Adapter disposal interface for graceful shutdown participation.
 *
 * Implement on any adapter that holds open resources that must be explicitly
 * released when the platform shuts down (e.g. SQLite WAL checkpoints,
 * network connections, background timers).
 *
 * Contract:
 * - `dispose()` MUST be idempotent — safe to call multiple times.
 * - `dispose()` MAY be synchronous (void) or asynchronous (Promise<void>).
 *   Prefer synchronous when possible — process.on('exit') callbacks that
 *   are async are silently dropped by Node.js.
 * - `dispose()` MUST NOT throw — catch all errors internally.
 */
export interface IDisposable {
  /**
   * Release all resources held by this adapter.
   *
   * Called by PlatformContainer during graceful shutdown (platform.shutdown()),
   * after all beforeShutdown hooks have run and before the 'shutdown' lifecycle
   * phase is emitted. Also called by process exit handlers registered in the
   * adapter constructor (for abrupt process termination).
   *
   * Must be idempotent — repeated calls must be no-ops.
   */
  dispose(): void | Promise<void>;
}

/**
 * Runtime type guard: check if a value implements the IDisposable interface.
 *
 * Used by service-bootstrap to identify which adapters will be disposed during
 * graceful shutdown, for structured observability logging.
 *
 * @example
 * ```typescript
 * import { isDisposable } from '@kb-labs/core-platform/adapters';
 *
 * const adapters = platform.listAdapters().filter(key =>
 *   isDisposable(platform.getAdapter(key))
 * );
 * // adapters = ['analytics', 'sqlDatabase'] — names of adapters with dispose()
 * ```
 */
export function isDisposable(value: unknown): value is IDisposable {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof (value as IDisposable).dispose === 'function'
  );
}
