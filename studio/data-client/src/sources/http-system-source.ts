/**
 * @module @kb-labs/studio-data-client/sources/http-system-source
 * HTTP implementation of SystemDataSource
 */

import type { HttpClient } from '../client/http-client';
import { KBError } from '../errors/kb-error';
import type { SystemDataSource, RoutesResponse } from './system-source';
import type {
  ReadyResponse,
  NotReadyResponse,
  SystemInfoPayload,
  SystemCapabilitiesPayload,
  SystemConfigPayload,
  InfoResponse,
  CapabilitiesResponse,
  ConfigResponse,
} from '@kb-labs/rest-api-contracts';
import type { ServiceObservabilityHealth } from '@kb-labs/core-contracts';
import type { HealthStatus } from '../contracts/system';

/**
 * HTTP implementation of SystemDataSource
 */
export class HttpSystemSource implements SystemDataSource {
  constructor(private client: HttpClient) {}

  async getHealth(): Promise<HealthStatus> {
    const snapshot = await this.client.fetch<ServiceObservabilityHealth>('/observability/health');
    const degraded = snapshot.status === 'degraded' || snapshot.state === 'partial_observability';

    return {
      ok: snapshot.status === 'healthy',
      timestamp: snapshot.observedAt,
      sources: snapshot.checks.length > 0
        ? snapshot.checks.map((check: ServiceObservabilityHealth['checks'][number]) => ({
          name: check.id,
          ok: check.status === 'ok',
          latency: check.latencyMs,
          error: check.status === 'warn'
            ? 'system_degraded'
            : check.status === 'error'
              ? check.message ?? 'system_error'
              : undefined,
        }))
        : [
          {
            name: 'system',
            ok: snapshot.status === 'healthy',
            error: degraded ? 'system_degraded' : undefined,
          },
        ],
      snapshot,
    };
  }

  /**
   * Get ready status
   */
  async getReady(): Promise<ReadyResponse | NotReadyResponse> {
    try {
      return this.client.fetch<ReadyResponse>('/ready');
    } catch (error) {
      if (error instanceof KBError && error.status === 503) {
        const payload = (error.cause as { data?: unknown } | undefined)?.data;
        if (payload && typeof payload === 'object' && 'ready' in payload) {
          return payload as NotReadyResponse;
        }
        return {
          ready: false,
          reason: 'unknown',
        } as NotReadyResponse;
      }
      throw error;
    }
  }

  /**
   * Get info
   */
  async getInfo(): Promise<SystemInfoPayload> {
    const response = await this.client.fetch<InfoResponse>('/info');
    return response.data;
  }

  /**
   * Get capabilities
   */
  async getCapabilities(): Promise<SystemCapabilitiesPayload> {
    const response = await this.client.fetch<CapabilitiesResponse>('/info/capabilities');
    return response.data;
  }

  /**
   * Get config (redacted)
   */
  async getConfig(): Promise<SystemConfigPayload> {
    const response = await this.client.fetch<ConfigResponse>('/info/config');
    return response.data;
  }

  /**
   * Get all registered API routes
   */
  async getRoutes(): Promise<RoutesResponse> {
    return this.client.fetch<RoutesResponse>('/routes');
  }

  /**
   * Get the base URL of the API
   */
  getBaseUrl(): string {
    return this.client.getBaseUrl();
  }
}
