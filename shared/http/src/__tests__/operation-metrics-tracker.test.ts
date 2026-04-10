import { describe, expect, it } from 'vitest';
import { OperationMetricsTracker } from '../operation-metrics-tracker.js';

describe('OperationMetricsTracker', () => {
  it('tracks operations and exposes top operations', () => {
    const tracker = new OperationMetricsTracker();

    tracker.recordOperation('registry.init', 12, 'ok');
    tracker.recordOperation('plugin.routes.mount', 50, 'ok');
    tracker.recordOperation('plugin.routes.mount', 10, 'error');

    expect(tracker.getTopOperations(5)).toEqual([
      expect.objectContaining({
        operation: 'plugin.routes.mount',
        count: 2,
        errorCount: 1,
      }),
      expect.objectContaining({
        operation: 'registry.init',
        count: 1,
        errorCount: 0,
      }),
    ]);
  });

  it('renders canonical metric lines grouped by status', () => {
    const tracker = new OperationMetricsTracker();

    tracker.recordOperation('plugin.routes.mount', 40, 'ok');
    tracker.recordOperation('plugin.routes.mount', 15, 'error');

    const lines = tracker.getMetricLines();

    expect(lines).toContain('service_operation_total{operation="plugin.routes.mount",status="ok"} 1');
    expect(lines).toContain('service_operation_total{operation="plugin.routes.mount",status="error"} 1');
  });

  it('observes async work and records failures', async () => {
    const tracker = new OperationMetricsTracker();

    await expect(
      tracker.observeOperation('marketplace.sync', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(tracker.getTopOperations(1)).toEqual([
      expect.objectContaining({
        operation: 'marketplace.sync',
        count: 1,
        errorCount: 1,
      }),
    ]);
  });
});
