/**
 * @module @kb-labs/core-platform/errors
 *
 * Platform-level error types shared by all adapter implementations.
 */

/**
 * Thrown by NoOp adapter implementations when a plugin tries to use a
 * platform service that has no honest fallback available (e.g. LLM,
 * Embeddings) and the operator hasn't configured a real adapter.
 *
 * Distinct from generic `Error` so callers can branch on it:
 *
 * ```ts
 * try {
 *   await platform.llm.complete(...);
 * } catch (err) {
 *   if (err instanceof AdapterUnavailableError) {
 *     // surface to user: "configure an LLM adapter"
 *   }
 * }
 * ```
 *
 * The gateway HTTP error mapper converts this into a structured response
 * `{code: 'ADAPTER_UNAVAILABLE', slot, reason}` for REST consumers.
 */
export class AdapterUnavailableError extends Error {
  /** Adapter slot, e.g. 'llm', 'embeddings', 'notifier'. */
  public readonly slot: string;
  /** Why the adapter is unavailable. */
  public readonly reason: 'not-configured' | 'load-failed';

  constructor(
    slot: string,
    reason: 'not-configured' | 'load-failed' = 'not-configured',
    message?: string,
  ) {
    super(
      message ??
        `Adapter "${slot}" is not available (reason: ${reason}). ` +
          `Configure a real adapter in kb.config.json under \`adapters.${slot}\`.`,
    );
    this.name = 'AdapterUnavailableError';
    this.slot = slot;
    this.reason = reason;
    Object.setPrototypeOf(this, AdapterUnavailableError.prototype);
  }
}
