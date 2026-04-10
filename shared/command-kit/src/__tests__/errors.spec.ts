import { describe, it, expect } from 'vitest';
import { formatError } from '../errors/index';

describe('formatError', () => {
  it('should format Error object', () => {
    const error = new Error('Something went wrong');
    const formatted = formatError(error);

    expect(formatted.message).toBe('Something went wrong');
    expect(formatted.json.ok).toBe(false);
    expect(formatted.json.error).toBe('Something went wrong');
  });

  it('should format string error', () => {
    const formatted = formatError('String error');

    expect(formatted.message).toBe('String error');
    expect(formatted.json.error).toBe('String error');
  });

  it('should include stack trace when showStack is true', () => {
    const error = new Error('Test error');
    const formatted = formatError(error, { showStack: true });

    expect(formatted.message).toContain('Test error');
    expect(formatted.message).toContain('Error: Test error');
    expect(formatted.json.stack).toBeDefined();
  });

  it('should include timing when provided', () => {
    const error = new Error('Test error');
    const formatted = formatError(error, { timingMs: 1234 });

    expect(formatted.json.timingMs).toBe(1234);
  });

  it('should not include stack when showStack is false', () => {
    const error = new Error('Test error');
    const formatted = formatError(error, { showStack: false });

    expect(formatted.message).toBe('Test error');
    expect(formatted.json.stack).toBeUndefined();
  });
});

