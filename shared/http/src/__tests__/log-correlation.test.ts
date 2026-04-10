import { describe, expect, it } from 'vitest';
import {
  createCorrelatedLogger,
  createServiceLogBindings,
  resolveObservabilityInstanceId,
} from '../log-correlation.js';

describe('createServiceLogBindings', () => {
  it('builds canonical correlation fields for request-scoped logs', () => {
    const bindings = createServiceLogBindings({
      serviceId: 'rest',
      logsSource: 'rest',
      layer: 'rest',
      service: 'request',
      requestId: 'req-123',
      traceId: 'trace-123',
      method: 'get',
      url: '/api/v1/plugins/abc123/routes/550e8400-e29b-41d4-a716-446655440000',
      operation: 'http.request',
    });

    expect(bindings.serviceId).toBe('rest');
    expect(bindings.logsSource).toBe('rest');
    expect(bindings.requestId).toBe('req-123');
    expect(bindings.reqId).toBe('req-123');
    expect(bindings.traceId).toBe('trace-123');
    expect(bindings.method).toBe('GET');
    expect(bindings.route).toBe('GET /api/v1/plugins/:id/routes/:id');
    expect(bindings.operation).toBe('http.request');
  });

  it('uses explicit route when provided and resolves instanceId by default', () => {
    const bindings = createServiceLogBindings({
      serviceId: 'workflow',
      route: 'POST /api/v1/jobs/:jobId',
      bindings: {
        jobId: 'job-1',
      },
    });

    expect(bindings.instanceId).toBe(resolveObservabilityInstanceId());
    expect(bindings.route).toBe('POST /api/v1/jobs/:jobId');
    expect(bindings.jobId).toBe('job-1');
  });

  it('merges canonical correlation fields into every log call', () => {
    const calls: Array<Record<string, unknown> | undefined> = [];
    const logger = createCorrelatedLogger({
      info(message: string, meta?: Record<string, unknown>) {
        expect(message).toBe('hello');
        calls.push(meta);
      },
      warn() {},
      error() {},
      fatal() {},
      debug() {},
      trace() {},
      child() {
        throw new Error('not needed');
      },
    }, {
      serviceId: 'workflow',
      logsSource: 'workflow',
      requestId: 'run-1',
      traceId: 'trace-1',
      operation: 'workflow.job',
    });

    logger.info('hello', { jobId: 'job-1' });

    expect(calls[0]).toMatchObject({
      serviceId: 'workflow',
      logsSource: 'workflow',
      requestId: 'run-1',
      reqId: 'run-1',
      traceId: 'trace-1',
      operation: 'workflow.job',
      jobId: 'job-1',
    });
  });
});
