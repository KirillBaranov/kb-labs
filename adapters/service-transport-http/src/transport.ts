import { Pool } from 'undici';
import type {
  IServiceTransport,
  ServiceConnectionInfo,
  ServiceTransportRequest,
  ServiceTransportResponse,
  ServiceTransportStream,
  ServiceTransportHealth,
} from '@kb-labs/core-platform';

export interface HttpServiceTransportConfig {
  services: Record<string, {
    url: string;
    socketPath?: string;
    timeoutMs?: number;
  }>;
}

export class HttpServiceTransport implements IServiceTransport {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly config: HttpServiceTransportConfig) {
    for (const [id, svc] of Object.entries(config.services)) {
      this.pools.set(id, new Pool(svc.url, {
        ...(svc.socketPath ? { socketPath: svc.socketPath } : {}),
        connections: 10,
        pipelining: 0,
      }));
    }
  }

  connectionInfo(serviceId: string): ServiceConnectionInfo | undefined {
    const svc = this.config.services[serviceId];
    if (!svc) return undefined;
    return { baseUrl: svc.url, socketPath: svc.socketPath };
  }

  async call(serviceId: string, req: ServiceTransportRequest): Promise<ServiceTransportResponse> {
    const pool = this.pools.get(serviceId);
    if (!pool) throw new Error(`Unknown service: ${serviceId}`);

    const svc = this.config.services[serviceId]!;
    const method = req.metadata?.['http-method'] ?? (req.payload !== undefined ? 'POST' : 'GET');

    const { statusCode, headers, body } = await pool.request({
      method,
      path: req.path,
      headers: {
        ...(req.payload !== undefined ? { 'content-type': 'application/json' } : {}),
        ...req.metadata,
      },
      body: req.payload !== undefined ? JSON.stringify(req.payload) : undefined,
      headersTimeout: req.timeoutMs ?? svc.timeoutMs ?? 30_000,
      signal: req.signal,
    });

    const payload = await body.json().catch(async () => {
      const text = await body.text().catch(() => undefined);
      return text ?? undefined;
    });

    return {
      ok: statusCode < 400,
      statusCode,
      payload,
      metadata: headers as Record<string, string>,
    };
  }

  async stream(serviceId: string, req: ServiceTransportRequest): Promise<ServiceTransportStream> {
    const pool = this.pools.get(serviceId);
    if (!pool) throw new Error(`Unknown service: ${serviceId}`);

    const svc = this.config.services[serviceId]!;
    const method = req.metadata?.['http-method'] ?? (req.payload !== undefined ? 'POST' : 'GET');

    const { statusCode, headers, body } = await pool.request({
      method,
      path: req.path,
      headers: {
        ...(req.payload !== undefined ? { 'content-type': 'application/json' } : {}),
        ...req.metadata,
      },
      body: req.payload !== undefined ? JSON.stringify(req.payload) : undefined,
      headersTimeout: req.timeoutMs ?? svc.timeoutMs ?? 30_000,
      signal: req.signal,
    });

    return {
      ok: statusCode < 400,
      statusCode,
      body: body as unknown as AsyncIterable<Uint8Array>,
      metadata: headers as Record<string, string>,
    };
  }

  async health(): Promise<ServiceTransportHealth> {
    const results: Record<string, boolean> = {};
    await Promise.allSettled(
      Object.keys(this.config.services).map(async id => {
        try {
          const res = await this.call(id, { path: '/health' });
          results[id] = res.ok;
        } catch {
          results[id] = false;
        }
      }),
    );
    const allOk = Object.values(results).every(Boolean);
    return { status: allOk ? 'ok' : 'degraded', services: results };
  }

  /** Drain and close all connection pools. */
  async destroy(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.pools.values()).map(pool => pool.destroy()),
    );
    this.pools.clear();
  }
}
