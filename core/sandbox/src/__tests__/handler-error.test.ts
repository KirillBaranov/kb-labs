import { describe, it, expect } from 'vitest';
import { normalizeError, HandlerErrorCode } from '../errors/handler-error.js';

describe('normalizeError', () => {
  it('normalizes Error instance with code and details', () => {
    const err = Object.assign(new Error('boom'), {
      code: HandlerErrorCode.HANDLER_TIMEOUT,
      details: { timeoutMs: 5000 },
    });
    const result = normalizeError(err);

    expect(result.code).toBe(HandlerErrorCode.HANDLER_TIMEOUT);
    expect(result.message).toBe('boom');
    expect(result.stack).toBeDefined();
    expect(result.details).toEqual({ timeoutMs: 5000 });
  });

  it('defaults to HANDLER_CRASHED for Error without code', () => {
    const result = normalizeError(new Error('generic'));
    expect(result.code).toBe(HandlerErrorCode.HANDLER_CRASHED);
    expect(result.message).toBe('generic');
  });

  it('normalizes string error', () => {
    const result = normalizeError('string error');
    expect(result.code).toBe(HandlerErrorCode.HANDLER_CRASHED);
    expect(result.message).toBe('string error');
    expect(result.stack).toBeUndefined();
  });

  it('normalizes object with code and message', () => {
    const result = normalizeError({
      code: 'CUSTOM_CODE',
      message: 'custom msg',
      details: { x: 1 },
    });
    expect(result.code).toBe('CUSTOM_CODE');
    expect(result.message).toBe('custom msg');
    expect(result.details).toEqual({ x: 1 });
  });

  it('normalizes object without code', () => {
    const result = normalizeError({ message: 'no code' });
    expect(result.code).toBe(HandlerErrorCode.HANDLER_CRASHED);
    expect(result.message).toBe('no code');
  });

  it('normalizes null', () => {
    const result = normalizeError(null);
    expect(result.code).toBe(HandlerErrorCode.HANDLER_CRASHED);
    expect(result.message).toBe('null');
  });

  it('normalizes undefined', () => {
    const result = normalizeError(undefined);
    expect(result.code).toBe(HandlerErrorCode.HANDLER_CRASHED);
    expect(result.message).toBe('undefined');
  });

  it('normalizes number', () => {
    const result = normalizeError(42);
    expect(result.code).toBe(HandlerErrorCode.HANDLER_CRASHED);
    expect(result.message).toBe('42');
  });
});

describe('HandlerErrorCode', () => {
  it('has all expected codes', () => {
    expect(HandlerErrorCode.HANDLER_CRASHED).toBe('HANDLER_CRASHED');
    expect(HandlerErrorCode.HANDLER_TIMEOUT).toBe('HANDLER_TIMEOUT');
    expect(HandlerErrorCode.HANDLER_VALIDATION_FAILED).toBe('HANDLER_VALIDATION_FAILED');
    expect(HandlerErrorCode.HANDLER_PERMISSION_DENIED).toBe('HANDLER_PERMISSION_DENIED');
    expect(HandlerErrorCode.HANDLER_NOT_FOUND).toBe('HANDLER_NOT_FOUND');
    expect(HandlerErrorCode.HANDLER_CANCELLED).toBe('HANDLER_CANCELLED');
  });
});
