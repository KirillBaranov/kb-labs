/**
 * @module @kb-labs/core-platform/adapters/service-transport
 * Transport abstraction for gateway → internal service communication.
 *
 * Platform-only adapter — lives in IPlatformAdapters, never reaches plugin context.
 * Not in ADAPTER_REGISTRY so applyPluginGovernance excludes it automatically.
 */

/** Connection details consumed by @fastify/http-proxy at gateway startup. */
export interface ServiceConnectionInfo {
  /** Base URL passed as `upstream` to @fastify/http-proxy */
  baseUrl: string;
  /** Unix domain socket path — enables zero-TCP-port mode in solo/dev */
  socketPath?: string;
}

/**
 * Transport-agnostic request descriptor.
 * HTTP: path="/api/v1/health", metadata=headers, payload=body
 * gRPC (future): path="workflow.Execute", metadata=grpc-metadata
 * AMQP (future): path="tasks.run", metadata=properties
 */
export interface ServiceTransportRequest {
  path: string;
  payload?: unknown;
  /** Key-value metadata — HTTP: headers, gRPC: metadata, AMQP: properties */
  metadata?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ServiceTransportResponse {
  /** true = success (HTTP 2xx, gRPC OK, AMQP ack) */
  ok: boolean;
  statusCode: number;
  payload?: unknown;
  metadata?: Record<string, string>;
}

export interface ServiceTransportStream {
  ok: boolean;
  statusCode: number;
  /** Unbuffered response body */
  body: AsyncIterable<Uint8Array>;
  metadata?: Record<string, string>;
}

export interface ServiceTransportHealth {
  status: 'ok' | 'degraded';
  services: Record<string, boolean>;
}

/**
 * Where a service should BIND, resolved from the same declarative network as
 * routing. Symmetric with connectionInfo (route): a daemon binds exactly where
 * the network publishes it. host MAY differ from the route host (e.g. k8s:
 * bind 0.0.0.0, route via cluster DNS) — that is intentional and keeps the
 * model correct across local / cloud / k8s.
 */
export type ServiceListenAddress = { host: string; port: number } | { socketPath: string };

export interface IServiceTransport {
  /**
   * Connection info for configuring @fastify/http-proxy per service.
   * Called once at gateway startup.
   */
  connectionInfo(serviceId: string): ServiceConnectionInfo | undefined;

  /**
   * Bind address for the service that hosts this serviceId — the symmetric
   * counterpart of connectionInfo, resolved from the same declarative map (so
   * bind and route stay consistent, including any offset). Optional: transports
   * that don't own binding may omit it; callers fall back to local defaults.
   */
  listenAddress?(serviceId: string): ServiceListenAddress | undefined;

  /**
   * Buffered request — use only for small payloads (health, admin calls).
   * For streaming responses use stream().
   */
  call(serviceId: string, req: ServiceTransportRequest): Promise<ServiceTransportResponse>;

  /**
   * Streaming request — returns status/headers plus unbuffered body AsyncIterable.
   * Use for SSE, file downloads, or any large/chunked response.
   */
  stream(serviceId: string, req: ServiceTransportRequest): Promise<ServiceTransportStream>;

  /** Optional health check across all configured services. */
  health?(): Promise<ServiceTransportHealth>;
}
