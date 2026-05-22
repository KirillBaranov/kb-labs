import type { SystemDataSource, RoutesResponse, PlatformHealthSnapshot } from '../sources/system-source';
import type { HealthStatus } from '../contracts/system';
import type { ServiceObservabilityHealth } from '@kb-labs/core-contracts';

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms);
  });
}

export class MockSystemSource implements SystemDataSource {
  async getHealth(): Promise<HealthStatus> {
    await delay(150);
    const snapshot: ServiceObservabilityHealth = {
      schema: 'kb.observability/1',
      contractVersion: '1.0',
      serviceId: 'rest',
      instanceId: 'mock-rest',
      observedAt: new Date().toISOString(),
      status: 'healthy',
      uptimeSec: 3600,
      metricsEndpoint: '/api/v1/metrics',
      logsSource: 'rest',
      capabilities: ['httpMetrics', 'eventLoopMetrics', 'operationMetrics', 'logCorrelation'],
      checks: [
        { id: 'registry', status: 'ok', message: 'Registry snapshot loaded' },
        { id: 'plugin-routes', status: 'ok', message: '12 plugin routes mounted' },
      ],
      snapshot: {
        cpuPercent: 6.2,
        rssBytes: 188_743_680,
        heapUsedBytes: 73_400_320,
        eventLoopLagMs: 12,
        activeOperations: 3,
      },
      topOperations: [
        { operation: 'http.GET /api/v1/health', count: 42, avgDurationMs: 3.1, maxDurationMs: 8.2, errorCount: 0 },
      ],
      state: 'active',
    };

    return {
      ok: true,
      timestamp: new Date().toISOString(),
      sources: [
        { name: 'registry', ok: true, latency: 100 },
        { name: 'plugin-routes', ok: true, latency: 120 },
      ],
      snapshot,
    };
  }

  async getPlatformHealth(): Promise<PlatformHealthSnapshot> {
    await delay(120);
    return {
      status: 'healthy',
      uptimeSec: 3600,
      registry: {
        total: 6,
        withRest: 4,
        withStudio: 3,
        errors: 0,
        partial: false,
        stale: false,
      },
      components: [
        { id: '@kb-labs/quality', version: '0.1.0', restRoutes: 11, studioWidgets: 1 },
        { id: '@kb-labs/workflow', version: '0.1.0', restRoutes: 6, studioWidgets: 1 },
        { id: '@kb-labs/marketplace', version: '0.1.0', restRoutes: 5, studioWidgets: 1 },
        { id: '@kb-labs/mind', version: '0.1.0', restRoutes: 3, studioWidgets: 0 },
        { id: '@kb-labs/commit', version: '0.1.0', restRoutes: 0, studioWidgets: 0 },
        { id: '@kb-labs/release', version: '0.1.0', restRoutes: 4, studioWidgets: 0 },
      ],
    };
  }

  async getRoutes(): Promise<RoutesResponse> {
    await delay(100);
    return {
      schema: 'kb.routes/1',
      ts: new Date().toISOString(),
      count: 5,
      routes: [
        { method: 'GET', url: '/api/v1/health' },
        { method: 'GET', url: '/api/v1/ready' },
        { method: 'GET', url: '/api/v1/plugins' },
        { method: 'GET', url: '/api/v1/plugins/:id' },
        { method: 'POST', url: '/api/v1/workflows/run' },
      ],
    };
  }

  getBaseUrl(): string {
    return 'http://localhost:5050/api/v1';
  }
}
