import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokens } from '../utils/token';

describe('Token Estimation', () => {
  it('should estimate tokens for simple text', () => {
    const text = 'Hello world this is a test';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length);
  });

  it('should handle empty text', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('   ')).toBeGreaterThan(0);
  });

  it('should apply code bonus for code-like content', () => {
    const codeText = 'function test() { return true; }';
    const normalText = 'This is normal text with similar length';
    
    const codeTokens = estimateTokens(codeText);
    const normalTokens = estimateTokens(normalText);
    
    // Code should have more tokens due to bonus
    expect(codeTokens).toBeGreaterThan(normalTokens);
  });

  it('should truncate text correctly', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const truncated = truncateToTokens(text, 2, 'middle');
    
    expect(truncated).toContain('Line 1');
    expect(truncated).toContain('Line 5');
    expect(truncated).toContain('...');
  });

  it('should handle truncation modes', () => {
    const text = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    
    const start = truncateToTokens(text, 2, 'start');
    expect(start).toContain('Line 1');
    expect(start).not.toContain('Line 5');
    
    const end = truncateToTokens(text, 2, 'end');
    expect(end).toContain('Line 5');
    expect(end).not.toContain('Line 1');
  });
});
