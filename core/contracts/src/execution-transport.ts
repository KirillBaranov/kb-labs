/**
 * @module @kb-labs/core-contracts
 *
 * IExecutionTransport — abstraction for sending plugin execution requests
 * to a remote runtime server.
 *
 * RemoteBackend depends only on this interface, not on any specific
 * infrastructure (Gateway, TCP, gRPC, etc.).
 *
 * Implementations live outside core-contracts:
 *   - GatewayDispatchTransport (@kb-labs/gateway-core) — via /internal/dispatch
 *   - future: TcpTransport, GrpcTransport, ...
 */

import type { ExecutionRequest } from './execution-request.js';

/**
 * Result returned by transport after remote execution.
 */
export interface TransportExecutionResult {
  /** Raw data returned by the handler */
  data: unknown;
}

/**
 * Transport abstraction — sends an execution request to a remote runtime
 * and returns the result.
 *
 * The transport is responsible for:
 *   - establishing the connection / routing
 *   - serialising the request
 *   - deserialising the response
 *   - timeout handling
 *
 * It is NOT responsible for:
 *   - handlerRef remapping (done by RemoteBackend before calling transport)
 *   - retry logic (done by the caller)
 *   - workspace / environment lifecycle
 */
export interface IExecutionTransport {
  /**
   * Send an execution request and wait for the result.
   * Throws on transport-level errors (connection refused, timeout, etc.).
   */
  execute(request: ExecutionRequest): Promise<TransportExecutionResult>;
}
