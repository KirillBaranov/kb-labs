import { describe, expect, it } from 'vitest';
import type { GatewayConfig } from '@kb-labs/gateway-contracts';
import {
  checkCanonicalObservabilityMetrics,
  validateServiceObservabilityDescribe,
  validateServiceObservabilityHealth,
} from '@kb-labs/core-contracts';
import { GatewayObservabilityCollector } from '../observability/collector.js';

const config: GatewayConfig = {
  port: 4000,
  upstreams: {
    rest: {
      url: 'http://localhost:5050',
      prefix: '/api/v1',
    },
  },
  staticTokens: {},
};

describe('GatewayObservabilityCollector', () => {
  it('builds versioned describe payload', () => {
    const collector = new GatewayObservabilityCollector(config);
    const payload = collector.buildDescribe();

    expect(payload).toMatchObject({
      serviceId: 'gateway',
      contractVersion: '1.0',
      metricsEndpoint: '/metrics',
      healthEndpoint: '/observability/health',
      capabilities: expect.arrayContaining(['httpMetrics', 'eventLoopMetrics']),
    });
    expect(validateServiceObservabilityDescribe(payload).ok).toBe(true);
  });

  it('builds health payload and exposes canonical metrics', async () => {
    const collector = new GatewayObservabilityCollector(config);
    const health = collector.buildHealth({
      status: 'healthy',
      adapterChecks: [{ id: 'llm', available: true, latencyMs: 2 }],
      upstreamChecks: [{ id: 'rest', status: 'up', latencyMs: 5 }],
    });

    expect(health).toMatchObject({
      serviceId: 'gateway',
      contractVersion: '1.0',
      status: 'healthy',
      state: 'active',
      checks: expect.arrayContaining([
        expect.objectContaining({ id: 'adapter:llm', status: 'ok' }),
        expect.objectContaining({ id: 'upstream:rest', status: 'ok' }),
      ]),
    });
    expect(validateServiceObservabilityHealth(health).ok).toBe(true);

    const metrics = await collector.renderPrometheusMetrics('healthy');
    expect(checkCanonicalObservabilityMetrics(metrics).missing).toEqual([]);
  });
});
