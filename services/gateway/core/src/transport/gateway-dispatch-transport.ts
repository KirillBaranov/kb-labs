/**
 * GatewayDispatchTransport — IExecutionTransport implementation via Gateway.
 *
 * Sends execution requests through POST /internal/dispatch, which routes
 * to the plugin-runtime-server connected to Gateway over WebSocket.
 *
 * This is the only place in the codebase that knows:
 *   - the /internal/dispatch endpoint
 *   - the x-internal-secret header
 *   - the Gateway-specific request shape
 *
 * RemoteBackend (in plugin-execution-factory) depends only on IExecutionTransport
 * and knows nothing about this implementation.
 */

import type { IExecutionTransport, TransportExecutionResult, ExecutionRequest } from '@kb-labs/core-contracts';

export interface RetryOn503Options {
  /** Max retry attempts on HTTP 503 (default: 30) */
  maxAttempts?: number;
  /** Delay between retries in ms (default: 1000) */
  delayMs?: number;
}

export interface GatewayDispatchTransportOptions {
  /** Full URL to POST /internal/dispatch, e.g. http://localhost:4000/internal/dispatch */
  dispatchEndpoint: string;

  /** x-internal-secret header value */
  internalSecret: string;

  /** hostId of the plugin-runtime-server registered in Gateway */
  runtimeHostId: string;

  /** Namespace for Gateway routing (default: 'default') */
  namespaceId?: string;

  /** Request timeout in ms (default: 60_000) */
  timeoutMs?: number;

  /**
   * Retry on HTTP 503 (runtime server not yet connected to Gateway).
   * When set, transport will poll until runtime server registers or attempts exhausted.
   * Useful for isolation: strict where container starts asynchronously.
   */
  retryOn503?: RetryOn503Options;
}

export class GatewayDispatchTransport implements IExecutionTransport {
  private readonly opts: Required<Pick<GatewayDispatchTransportOptions, 'dispatchEndpoint' | 'internalSecret' | 'runtimeHostId' | 'timeoutMs'>>
    & Pick<GatewayDispatchTransportOptions, 'namespaceId' | 'retryOn503'>;

  constructor(options: GatewayDispatchTransportOptions) {
    this.opts = {
      dispatchEndpoint: options.dispatchEndpoint,
      internalSecret: options.internalSecret,
      runtimeHostId: options.runtimeHostId,
      namespaceId: options.namespaceId,
      timeoutMs: options.timeoutMs ?? 60_000,
      retryOn503: options.retryOn503,
    };
  }

  async execute(request: ExecutionRequest): Promise<TransportExecutionResult> {
    const retry = this.opts.retryOn503;
    const maxAttempts = retry?.maxAttempts ?? 1;
    const delayMs = retry?.delayMs ?? 1000;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

      try {
        const response = await fetch(this.opts.dispatchEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': this.opts.internalSecret,
          },
          body: JSON.stringify({
            hostId: this.opts.runtimeHostId,
            namespaceId: this.opts.namespaceId,
            adapter: 'execution',
            method: 'execute',
            args: [request],
          }),
          signal: controller.signal,
        });

        if (response.status === 503 && attempt < maxAttempts) {
          const body = await response.text().catch(() => '');
          lastError = new Error(`Gateway dispatch failed: HTTP 503 — ${body}`);
          await sleep(delayMs);
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Gateway dispatch failed: HTTP ${response.status} — ${body}`);
        }

        const json = await response.json() as { result?: unknown };
        return { data: json.result };
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError ?? new Error('Gateway dispatch failed: max retry attempts exhausted');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
