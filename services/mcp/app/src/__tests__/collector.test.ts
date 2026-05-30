import { describe, it, expect } from 'vitest';
import { McpObservabilityCollector } from '../observability/collector.js';

describe('McpObservabilityCollector', () => {
  it('buildDescribe produces a valid contract payload', () => {
    const col = new McpObservabilityCollector();
    const desc = col.buildDescribe(true, 42);
    expect(desc.schema).toBe('kb.observability/1');
    expect(desc.contractVersion).toBe('1.0');
    expect(desc.serviceId).toBe('mcp-daemon');
    expect(desc.serviceType).toBe('mcp-server');
    expect(desc.metricsEndpoint).toBe('/metrics');
    expect(desc.healthEndpoint).toBe('/observability/health');
    expect(desc.capabilities).toContain('operationMetrics');
    expect(desc.capabilities).toContain('logCorrelation');
    expect((desc.meta as Record<string, unknown>)['toolCount']).toBe(42);
    expect((desc.meta as Record<string, unknown>)['registryReady']).toBe(true);
  });

  it('buildHealth produces a valid contract payload', () => {
    const col = new McpObservabilityCollector();
    const h = col.buildHealth(true, 10, 'subprocess');
    expect(h.schema).toBe('kb.observability/1');
    expect(h.serviceId).toBe('mcp-daemon');
    expect(h.status).toBe('healthy');
    expect(h.metricsEndpoint).toBe('/metrics');
    expect(h.checks.some((c) => c.id === 'registry')).toBe(true);
    expect(h.checks.some((c) => c.id === 'execution')).toBe(true);
    const execCheck = h.checks.find((c) => c.id === 'execution');
    expect(execCheck?.message).toContain('subprocess');
  });

  it('buildHealth returns degraded when registry not ready', () => {
    const col = new McpObservabilityCollector();
    const h = col.buildHealth(false, 0, 'subprocess');
    expect(h.status).toBe('degraded');
    const regCheck = h.checks.find((c) => c.id === 'registry');
    expect(regCheck?.status).toBe('warn');
  });

  it('recordOp appears in getMetricLines output', () => {
    const col = new McpObservabilityCollector();
    col.recordOp('mcp.tools.list', 12, true);
    col.recordOp('mcp.tool.call', 340, true);
    col.recordOp('mcp.tool.call', 50, false);
    const metrics = col.renderPrometheusMetrics(5);
    expect(metrics).toContain('service_operation_total{operation="mcp.tools.list",status="ok"}');
    expect(metrics).toContain('service_operation_total{operation="mcp.tool.call",status="ok"}');
    expect(metrics).toContain('service_operation_total{operation="mcp.tool.call",status="error"}');
    expect(metrics).toContain('mcp_tools_total 5');
  });

  it('renderPrometheusMetrics includes process metrics', () => {
    const col = new McpObservabilityCollector();
    const metrics = col.renderPrometheusMetrics(0);
    expect(metrics).toContain('process_rss_bytes');
    expect(metrics).toContain('process_heap_used_bytes');
    expect(metrics).toContain('process_uptime_seconds');
    expect(metrics).toContain('http_requests_total');
  });

  it('topOperations appears in buildHealth after recording ops', () => {
    const col = new McpObservabilityCollector();
    col.recordOp('mcp.tool.call', 100, true);
    col.recordOp('mcp.tool.call', 200, true);
    const h = col.buildHealth(true, 5, 'subprocess');
    const topOp = h.topOperations?.find((o) => o.operation === 'mcp.tool.call');
    expect(topOp).toBeDefined();
    expect(topOp?.count).toBe(2);
  });
});
