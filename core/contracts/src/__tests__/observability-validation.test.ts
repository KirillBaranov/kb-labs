import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SERVICE_LOG_FIELDS,
  checkCanonicalObservabilityMetrics,
  validateServiceObservabilityDescribe,
  validateServiceObservabilityHealth,
} from '../observability.js';

const VALID_DESCRIBE = {
  schema: 'kb.observability/1',
  contractVersion: '1.0',
  serviceId: 'rest',
  instanceId: 'rest-1',
  serviceType: 'http-api',
  version: '1.0.0',
  environment: 'development',
  startedAt: '2026-04-01T10:00:00.000Z',
  dependencies: [
    { serviceId: 'workflow', required: true, description: 'Workflow daemon' },
  ],
  metricsEndpoint: '/api/v1/metrics',
  healthEndpoint: '/api/v1/observability/health',
  logsSource: 'rest',
  capabilities: ['httpMetrics', 'eventLoopMetrics', 'operationMetrics', 'logCorrelation'],
  metricFamilies: [
    'process_cpu_percent',
    'process_rss_bytes',
    'process_heap_used_bytes',
    'process_event_loop_lag_ms',
    'service_health_status',
    'service_restarts_total',
    'service_active_operations',
    'http_requests_total',
    'http_errors_total',
    'http_request_duration_ms',
    'service_operation_total',
    'service_operation_duration_ms',
  ],
} as const;

const VALID_HEALTH = {
  schema: 'kb.observability/1',
  contractVersion: '1.0',
  serviceId: 'rest',
  instanceId: 'rest-1',
  observedAt: '2026-04-01T10:00:00.000Z',
  status: 'healthy',
  uptimeSec: 120,
  metricsEndpoint: '/api/v1/metrics',
  logsSource: 'rest',
  capabilities: ['httpMetrics', 'eventLoopMetrics', 'operationMetrics', 'logCorrelation'],
  checks: [
    { id: 'registry', status: 'ok', message: 'Registry loaded', latencyMs: 12 },
  ],
  snapshot: {
    cpuPercent: 12,
    rssBytes: 100,
    heapUsedBytes: 50,
    eventLoopLagMs: 10,
    activeOperations: 1,
  },
  topOperations: [
    { operation: 'http.GET /health', count: 2, avgDurationMs: 1.5, maxDurationMs: 2, errorCount: 0 },
  ],
  state: 'active',
  meta: {
    readyEndpoint: '/api/v1/ready',
  },
} as const;

describe('observability validators', () => {
  it('accepts valid describe and health payloads', () => {
    expect(validateServiceObservabilityDescribe(VALID_DESCRIBE)).toEqual({
      ok: true,
      value: VALID_DESCRIBE,
    });
    expect(validateServiceObservabilityHealth(VALID_HEALTH)).toEqual({
      ok: true,
      value: VALID_HEALTH,
    });
  });

  it('rejects invalid payloads', () => {
    const invalidDescribe = {
      ...VALID_DESCRIBE,
      contractVersion: '2.0',
      capabilities: ['unknown-capability'],
    };
    const invalidHealth = {
      ...VALID_HEALTH,
      status: 'broken',
      checks: [{ id: '', status: 'bad' }],
    };

    const describeResult = validateServiceObservabilityDescribe(invalidDescribe);
    const healthResult = validateServiceObservabilityHealth(invalidHealth);

    expect(describeResult.ok).toBe(false);
    expect(describeResult.ok ? [] : describeResult.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['contractVersion', 'capabilities.0']),
    );
    expect(healthResult.ok).toBe(false);
    expect(healthResult.ok ? [] : healthResult.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['status', 'checks.0.id', 'checks.0.status']),
    );
  });
});

describe('canonical metrics compliance', () => {
  it('detects missing canonical metric families', () => {
    const metrics = `
      process_cpu_percent 1
      process_rss_bytes 2
      process_heap_used_bytes 3
      process_event_loop_lag_ms 4
      service_health_status 2
      service_restarts_total 0
      service_active_operations 1
      http_requests_total{route="/health"} 1
      http_errors_total 0
      http_request_duration_ms_bucket{le="5"} 1
      http_request_duration_ms_sum 1
      http_request_duration_ms_count 1
    `;

    const result = checkCanonicalObservabilityMetrics(metrics);
    expect(result.present).toEqual(
      expect.arrayContaining([
        'process_cpu_percent',
        'http_request_duration_ms',
        'http_requests_total',
      ]),
    );
    expect(result.missing).toEqual(
      expect.arrayContaining([
        'service_operation_total',
        'service_operation_duration_ms',
      ]),
    );
  });
});

describe('log correlation contract', () => {
  it('exports canonical structured log fields for service correlation', () => {
    expect(CANONICAL_SERVICE_LOG_FIELDS).toEqual([
      'serviceId',
      'instanceId',
      'logsSource',
      'requestId',
      'reqId',
      'traceId',
      'operation',
      'route',
      'method',
      'url',
    ]);
  });
});
