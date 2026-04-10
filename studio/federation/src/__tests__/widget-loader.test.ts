import { describe, it, expect } from 'vitest';
import { PageLoadError } from '../widget-loader';

describe('PageLoadError', () => {
  it('stores remote name and exposed module', () => {
    const err = new PageLoadError('failed', 'commitPlugin', './CommitOverview');
    expect(err.remoteName).toBe('commitPlugin');
    expect(err.exposedModule).toBe('./CommitOverview');
    expect(err.message).toBe('failed');
    expect(err.name).toBe('PageLoadError');
  });

  it('stores cause error', () => {
    const cause = new Error('network error');
    const err = new PageLoadError('failed', 'p', './M', cause);
    expect(err.cause).toBe(cause);
  });

  it('is instanceof Error', () => {
    const err = new PageLoadError('msg', 'p', './M');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(PageLoadError);
  });
});
