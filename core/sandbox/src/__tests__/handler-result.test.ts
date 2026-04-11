import { describe, it, expect } from 'vitest';
import { normalizeHandlerResult, type HandlerResultObject } from '../types/handler-result.js';

describe('normalizeHandlerResult', () => {
  it('normalizes number to HandlerResultObject', () => {
    const result = normalizeHandlerResult(0);
    expect(result).toEqual({ exitCode: 0 });
  });

  it('normalizes non-zero exit code', () => {
    const result = normalizeHandlerResult(1);
    expect(result).toEqual({ exitCode: 1 });
  });

  it('passes through HandlerResultObject as-is', () => {
    const input: HandlerResultObject = {
      exitCode: 0,
      data: { key: 'value' },
      metadata: { duration: 100 },
    };
    const result = normalizeHandlerResult(input);
    expect(result).toEqual(input);
  });

  it('normalizes AsyncIterable to exitCode 0 with data', () => {
    const asyncIterable = {
      [Symbol.asyncIterator]() {
        return { next: async () => ({ done: true, value: undefined }) };
      },
    };
    const result = normalizeHandlerResult(asyncIterable);
    expect(result.exitCode).toBe(0);
    expect(result.data).toBe(asyncIterable);
  });

  it('preserves metadata fields', () => {
    const result = normalizeHandlerResult({
      exitCode: 0,
      metadata: { progress: 0.5, custom: 'field' },
    });
    expect(result.metadata?.progress).toBe(0.5);
    expect(result.metadata?.custom).toBe('field');
  });
});
