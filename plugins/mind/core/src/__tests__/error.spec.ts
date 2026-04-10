import { describe, it, expect } from 'vitest';
import { MindError, getExitCode, ERROR_HINTS } from '../error/mind-error';

describe('MindError', () => {
  it('should create error with code and message', () => {
    const error = new MindError('MIND_TEST', 'Test error message');
    
    expect(error.name).toBe('MindError');
    expect(error.code).toBe('MIND_TEST');
    expect(error.message).toBe('Test error message');
    expect(error.hint).toBeUndefined();
    expect(error.meta).toBeUndefined();
  });

  it('should create error with hint and meta', () => {
    const meta = { file: 'test.ts', line: 42 };
    const error = new MindError('MIND_TEST', 'Test error', 'Try again', meta);
    
    expect(error.hint).toBe('Try again');
    expect(error.meta).toBe(meta);
  });

  it('should map error codes to exit codes', () => {
    expect(getExitCode(new MindError('MIND_FORBIDDEN', 'Forbidden'))).toBe(3);
    expect(getExitCode(new MindError('MIND_NO_GIT', 'No git'))).toBe(2);
    expect(getExitCode(new MindError('MIND_FS_TIMEOUT', 'Timeout'))).toBe(2);
    expect(getExitCode(new MindError('MIND_PARSE_ERROR', 'Parse error'))).toBe(1);
    expect(getExitCode(new MindError('MIND_PACK_BUDGET_EXCEEDED', 'Budget'))).toBe(1);
    expect(getExitCode(new MindError('MIND_OTHER', 'Other'))).toBe(1);
    expect(getExitCode(new MindError('UNKNOWN', 'Unknown'))).toBe(1);
  });

  it('should have error hints for all codes', () => {
    expect(ERROR_HINTS.MIND_NO_GIT).toBeDefined();
    expect(ERROR_HINTS.MIND_FS_TIMEOUT).toBeDefined();
    expect(ERROR_HINTS.MIND_PARSE_ERROR).toBeDefined();
    expect(ERROR_HINTS.MIND_PACK_BUDGET_EXCEEDED).toBeDefined();
    expect(ERROR_HINTS.MIND_FORBIDDEN).toBeDefined();
    expect(ERROR_HINTS.MIND_TIME_BUDGET).toBeDefined();
  });
});
