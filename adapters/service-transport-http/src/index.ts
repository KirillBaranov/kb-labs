/**
 * @module @kb-labs/adapters-service-transport-http
 * HTTP/unix-socket implementation of IServiceTransport.
 *
 * Uses undici connection pools — supports both TCP and unix domain sockets.
 * Platform-only: never exposed to plugin context.
 */

import { HttpServiceTransport, type HttpServiceTransportConfig } from './transport.js';

export { HttpServiceTransport, type HttpServiceTransportConfig, applyPortOffset } from './transport.js';
export { manifest } from './manifest.js';

export function createAdapter(config: HttpServiceTransportConfig): HttpServiceTransport {
  return new HttpServiceTransport(config);
}

export type {
  IServiceTransport,
  ServiceConnectionInfo,
  ServiceTransportRequest,
  ServiceTransportResponse,
  ServiceTransportStream,
  ServiceTransportHealth,
} from '@kb-labs/sdk';
