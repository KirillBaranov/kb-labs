import { describe, it, expect } from 'vitest';
import {
  TransportError,
  TimeoutError,
  CircuitOpenError,
  isRetryableError,
} from '../transport/transport.js';
import { getOperationTimeout, selectTimeout, OPERATION_TIMEOUTS } from '../transport/timeout-config.js';

describe('TransportError', () => {
  it('sets name and message', () => {
    const err = new TransportError('connection failed');
    expect(err.name).toBe('TransportError');
    expect(err.message).toBe('connection failed');
    expect(err instanceof Error).toBe(true);
  });

  it('wraps cause and appends to stack', () => {
    const cause = new Error('root cause');
    const err = new TransportError('outer', cause);
    expect(err.cause).toBe(cause);
    expect(err.stack).toContain('Caused by:');
  });

  it('no cause — cause is undefined', () => {
    const err = new TransportError('no cause');
    expect(err.cause).toBeUndefined();
    expect(err.stack).not.toContain('Caused by:');
  });
});

describe('TimeoutError', () => {
  it('sets name, message, and timeoutMs', () => {
    const err = new TimeoutError('timed out', 5000);
    expect(err.name).toBe('TimeoutError');
    expect(err.timeoutMs).toBe(5000);
    expect(err instanceof TransportError).toBe(true);
  });
});

describe('CircuitOpenError', () => {
  it('sets name and is a TransportError', () => {
    const err = new CircuitOpenError('circuit open');
    expect(err.name).toBe('CircuitOpenError');
    expect(err instanceof TransportError).toBe(true);
  });
});

describe('isRetryableError', () => {
  it('TimeoutError → retryable', () => {
    expect(isRetryableError(new TimeoutError('timeout', 3000))).toBe(true);
  });

  it('CircuitOpenError → NOT retryable', () => {
    expect(isRetryableError(new CircuitOpenError('circuit open'))).toBe(false);
  });

  it('network error codes → retryable', () => {
    for (const code of ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']) {
      const err = Object.assign(new Error('network err'), { code });
      expect(isRetryableError(err), `code=${code}`).toBe(true);
    }
  });

  it('unknown error code → NOT retryable', () => {
    const err = Object.assign(new Error('unknown'), { code: 'EBADF' });
    expect(isRetryableError(err)).toBe(false);
  });

  it('status 503 → retryable', () => {
    const err = Object.assign(new Error('unavailable'), { status: 503 });
    expect(isRetryableError(err)).toBe(true);
  });

  it('status 429 → retryable', () => {
    const err = Object.assign(new Error('rate limit'), { statusCode: 429 });
    expect(isRetryableError(err)).toBe(true);
  });

  it('status 400 → NOT retryable', () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('status 401 → NOT retryable', () => {
    const err = Object.assign(new Error('unauthorized'), { status: 401 });
    expect(isRetryableError(err)).toBe(false);
  });

  it('plain Error with no code/status → NOT retryable', () => {
    expect(isRetryableError(new Error('generic'))).toBe(false);
  });
});

describe('getOperationTimeout', () => {
  it('exact match takes priority', () => {
    expect(getOperationTimeout('vectorStore', 'upsert')).toBe(120_000);
    expect(getOperationTimeout('cache', 'get')).toBe(5_000);
    expect(getOperationTimeout('embeddings', 'embedBatch')).toBe(120_000);
  });

  it('falls back to adapter wildcard for unknown method', () => {
    expect(getOperationTimeout('vectorStore', 'unknownMethod')).toBe(OPERATION_TIMEOUTS['vectorStore.*']);
    expect(getOperationTimeout('cache', 'weirdOp')).toBe(OPERATION_TIMEOUTS['cache.*']);
  });

  it('falls back to global * for completely unknown adapter', () => {
    expect(getOperationTimeout('unknownAdapter', 'unknownMethod')).toBe(30_000);
  });

  it('llm operations use generous timeouts', () => {
    expect(getOperationTimeout('llm', 'generate')).toBe(90_000);
    expect(getOperationTimeout('llm', 'generateStream')).toBe(120_000);
  });
});

describe('selectTimeout', () => {
  it('explicit call.timeout has highest priority', () => {
    expect(selectTimeout({ adapter: 'vectorStore', method: 'upsert', timeout: 999 }, 30_000)).toBe(999);
  });

  it('configTimeout wins over operation-specific when no call.timeout', () => {
    expect(selectTimeout({ adapter: 'vectorStore', method: 'upsert' }, 90_000)).toBe(90_000);
  });

  it('operation-specific timeout used when no overrides', () => {
    expect(selectTimeout({ adapter: 'vectorStore', method: 'upsert' }, undefined)).toBe(120_000);
  });

  it('global fallback for unknown adapter + no config', () => {
    expect(selectTimeout({ adapter: 'unknown', method: 'op' }, undefined)).toBe(30_000);
  });

  it('call.timeout=0 is respected (explicit zero)', () => {
    expect(selectTimeout({ adapter: 'cache', method: 'get', timeout: 0 }, 5_000)).toBe(0);
  });
});
