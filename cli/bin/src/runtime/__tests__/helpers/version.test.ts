/**
 * Unit tests for version helper
 */

import { describe, it, expect } from 'vitest';
import { resolveVersion } from '../../helpers/version';

describe('resolveVersion', () => {
  it('should return options version when provided', () => {
    expect(resolveVersion('1.2.3', {})).toBe('1.2.3');
  });

  it('should return env version when options not provided', () => {
    expect(resolveVersion(undefined, { KB_VERSION: '2.0.0' })).toBe('2.0.0');
  });

  it('should prefer options over env', () => {
    expect(resolveVersion('1.0.0', { KB_VERSION: '2.0.0' })).toBe('1.0.0');
  });

  it('should return "unknown" when neither provided', () => {
    expect(resolveVersion(undefined, {})).toBe('unknown');
  });

  it('should handle empty env object', () => {
    expect(resolveVersion(undefined, {})).toBe('unknown');
  });

  it('should handle empty string in options', () => {
    expect(resolveVersion('', {})).toBe('');
  });

  it('should handle empty string in env', () => {
    expect(resolveVersion(undefined, { KB_VERSION: '' })).toBe('');
  });
});
