/**
 * @module @kb-labs/core-contracts
 *
 * Host resolution abstraction for execution routing.
 *
 * Execution layer uses IHostResolver to find which host should handle
 * a request — without knowing about Gateway, WebSocket, or HTTP.
 */

import type { ExecutionTarget, HostSelectionStrategy } from './execution-request.js';

/**
 * Result of host resolution.
 */
export interface HostResolution {
  /** Resolved host identifier. */
  hostId: string;
  /** Which strategy produced this result. */
  strategy: HostSelectionStrategy;
  /** Namespace the host belongs to. */
  namespaceId: string;
}

/**
 * Resolves an ExecutionTarget to a concrete host.
 *
 * Implementations may use Gateway REST API, local registry, config file, etc.
 * The execution layer only knows this interface — never the transport details.
 */
export interface IHostResolver {
  /**
   * Resolve a target to a host.
   *
   * @returns HostResolution if a suitable host is found, null otherwise.
   *          Null signals the caller to apply fallback policy.
   */
  resolve(target: ExecutionTarget): Promise<HostResolution | null>;
}
