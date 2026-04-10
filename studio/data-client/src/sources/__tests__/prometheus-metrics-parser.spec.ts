import { describe, expect, it } from 'vitest';
import { parsePrometheusMetrics } from '../prometheus-metrics-parser';

const PROMETHEUS_PAYLOAD = `
# HELP http_request_duration_ms HTTP request duration in milliseconds
# TYPE http_request_duration_ms histogram
http_request_duration_ms_bucket{le="5",method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 10
http_request_duration_ms_bucket{le="10",method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 15
http_request_duration_ms_bucket{le="25",method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 20
http_request_duration_ms_bucket{le="+Inf",method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 20
http_request_duration_ms_sum{method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 120
http_request_duration_ms_count{method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 20
http_requests_total{method="GET",route="/api/v1/health",status_code="200",tenant="default",plugin=""} 18
http_requests_total{method="GET",route="/api/v1/plugins",status_code="500",tenant="default",plugin="quality"} 2
kb_plugin_request_total{plugin="quality",status_code="500"} 2
kb_plugin_request_duration_ms_sum{plugin="quality"} 90
kb_plugin_request_duration_ms_count{plugin="quality"} 2
kb_tenant_request_total{tenant="default"} 20
kb_tenant_request_errors_total{tenant="default"} 2
kb_tenant_request_duration_ms_sum{tenant="default"} 120
kb_tenant_request_duration_ms_count{tenant="default"} 20
process_uptime_seconds 300
kb_plugins_mount_total 4
kb_plugins_mount_succeeded 3
kb_plugins_mount_failed 1
kb_plugins_mount_elapsed_ms 12
kb_redis_status_updates_total 5
kb_redis_status_transitions_total{state="healthy"} 2
kb_redis_status_transitions_total{state="unhealthy"} 1
kb_redis_healthy 1
`;

describe('parsePrometheusMetrics', () => {
  it('builds studio metrics from canonical Prometheus text', () => {
    const result = parsePrometheusMetrics(PROMETHEUS_PAYLOAD);

    expect(result.requests).toEqual({
      total: 20,
      success: 18,
      clientErrors: 0,
      serverErrors: 2,
    });
    expect(result.latency.average).toBe(6);
    expect(result.perPlugin).toEqual([
      {
        pluginId: 'quality',
        requests: 2,
        errors: 2,
        latency: {
          average: 45,
          min: 0,
          max: 0,
        },
      },
    ]);
    expect(result.perTenant).toEqual([
      {
        tenantId: 'default',
        requests: 20,
        errors: 2,
        latency: {
          average: 6,
        },
      },
    ]);
    expect(result.errors.byStatusCode[500]).toBe(2);
    expect(result.pluginMounts).toEqual({
      total: 4,
      succeeded: 3,
      failed: 1,
      elapsedMs: 12,
    });
    expect(result.redis.lastStatus).toEqual({
      healthy: true,
      state: 'healthy',
      role: 'unknown',
    });
    expect(result.uptime.seconds).toBe(300);
  });
});
