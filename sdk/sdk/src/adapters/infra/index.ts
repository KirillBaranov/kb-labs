/**
 * @module @kb-labs/sdk/adapters/infra
 *
 * Public surface for infrastructure-level adapter packages (transport,
 * notifier-router) that must compose with platform plumbing — IPC transports,
 * resource broker queueing, and runtime-side notifier wiring.
 *
 * Application-level adapters (LLM, storage, analytics, etc) should NOT import
 * from this sub-path — they need only `@kb-labs/sdk/adapters`.
 *
 * Thin re-export layer over `@kb-labs/core-runtime` and
 * `@kb-labs/core-resource-broker`. Keep additive: if an infra adapter needs
 * something new, extend this barrel rather than reaching into platform
 * internals directly.
 */

// Shared retry classification facade for infrastructure adapters.
export {
  classifyFailure,
  decideRetry,
  DEFAULT_TRANSIENT_RETRY_POLICY,
} from '@kb-labs/core-retry';

// Transport (IPC layer used by adapters/transport)
export type {
  ITransport,
  TransportConfig,
  PendingRequest,
  UnixSocketConfig,
  UnixSocketServerConfig,
} from '@kb-labs/core-runtime';
export {
  TransportError,
  TimeoutError,
  CircuitOpenError,
  isRetryableError,
  IPCTransport,
  createIPCTransport,
  UnixSocketTransport,
  createUnixSocketTransport,
  UnixSocketServer,
  IPCServer,
  createIPCServer,
} from '@kb-labs/core-runtime';

// Notifier runtime wiring (used by adapters/notifier-router)
export type {
  NotifierAdapterOptions,
  NotifierRoutingRule,
} from '@kb-labs/core-runtime';

// Resource broker (used by adapters/notifier-router for queued channels)
export type { IResourceBroker } from '@kb-labs/core-resource-broker';
export { createQueuedNotifierChannel } from '@kb-labs/core-resource-broker';
