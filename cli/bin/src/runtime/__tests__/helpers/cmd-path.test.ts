/**
 * Unit tests for command path helper
 */

import { describe, it, expect } from 'vitest';
import { normalizeCmdPath } from '../../helpers/cmd-path';

describe('normalizeCmdPath', () => {
  it('should split colon-separated command', () => {
    expect(normalizeCmdPath(['product:setup'])).toEqual(['product', 'setup']);
  });

  it('should split multi-part colon command', () => {
    expect(normalizeCmdPath(['product:setup:rollback'])).toEqual(['product', 'setup', 'rollback']);
  });

  it('should preserve array commands', () => {
    expect(normalizeCmdPath(['product', 'setup'])).toEqual(['product', 'setup']);
  });

  it('should preserve single command without colon', () => {
    expect(normalizeCmdPath(['product'])).toEqual(['product']);
  });

  it('should handle empty array', () => {
    expect(normalizeCmdPath([])).toEqual([]);
  });

  it('should handle multiple array elements', () => {
    expect(normalizeCmdPath(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('should only split single-element arrays with colons', () => {
    // Multi-element arrays are NOT split even if they contain colons
    expect(normalizeCmdPath(['product:setup', 'other'])).toEqual(['product:setup', 'other']);
  });

  it('should handle empty string', () => {
    expect(normalizeCmdPath([''])).toEqual(['']);
  });

  it('should handle colon at start', () => {
    expect(normalizeCmdPath([':product'])).toEqual(['', 'product']);
  });

  it('should handle colon at end', () => {
    expect(normalizeCmdPath(['product:'])).toEqual(['product', '']);
  });

  it('should handle multiple consecutive colons', () => {
    expect(normalizeCmdPath(['product::setup'])).toEqual(['product', '', 'setup']);
  });
});
