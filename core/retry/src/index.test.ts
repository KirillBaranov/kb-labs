import { describe, expect, it } from 'vitest';
import { classifyFailure, decideRetry } from './index.js';

describe('classifyFailure', () => {
  it('does not classify stderr text as a failure', () => {
    const failure = classifyFailure({ message: 'diagnostic on stderr' }, { source: 'command' });
    expect(failure.kind).toBe('command');
    expect(failure.transient).toBe(false);
  });

  it('classifies structured network errors', () => {
    const failure = classifyFailure({ message: 'registry unavailable', code: 'NETWORK_UNAVAILABLE', kind: 'network' }, { source: 'command' });
    expect(failure).toMatchObject({ kind: 'network', code: 'NETWORK_UNAVAILABLE', transient: true });
  });
});

describe('decideRetry', () => {
  it('does not retry command failures under the implicit policy', () => {
    const failure = classifyFailure({ message: 'checks failed', kind: 'command' }, { source: 'command' });
    expect(decideRetry({ failure, attempt: 0 }).retry).toBe(false);
  });

  it('does not retry unsafe network failures without idempotency', () => {
    const failure = classifyFailure({ message: 'connection reset', code: 'ECONNRESET' }, { source: 'execution', phase: 'response' });
    expect(decideRetry({ failure, attempt: 0 }).reason).toBe('not_idempotent');
  });

  it('retries a safe dispatch network failure', () => {
    const failure = classifyFailure({ message: 'connection refused', code: 'ECONNREFUSED' }, { source: 'execution', phase: 'dispatch' });
    expect(decideRetry({ failure, attempt: 0 }).retry).toBe(true);
  });
});
