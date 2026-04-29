import { describe, expect, it } from 'vitest';
import { capitalize } from '../capitalize.js';

describe('capitalize', () => {
  it('uppercases the first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });
  it('leaves already-capitalized string unchanged', () => {
    expect(capitalize('World')).toBe('World');
  });
  it('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });
  it('handles single character', () => {
    expect(capitalize('a')).toBe('A');
  });
  it('does not alter remaining characters', () => {
    expect(capitalize('hELLO')).toBe('HELLO');
  });
});
