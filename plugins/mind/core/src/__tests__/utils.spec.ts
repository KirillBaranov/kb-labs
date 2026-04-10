/**
 * Additional tests for mind-core utilities
 */

import { describe, it, expect } from 'vitest';
import { estimateTokens, truncateToTokens, sha256, DEFAULT_BUDGET } from '../index';

describe('Token Utilities', () => {
  it('should estimate tokens correctly', () => {
    const text = 'Hello world';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length);
  });

  it('should handle empty strings', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('should handle long text', () => {
    const longText = 'a'.repeat(1000);
    const tokens = estimateTokens(longText);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(longText.length);
  });
});

describe('Token Truncation', () => {
  it('should truncate to specified tokens', () => {
    const text = 'This is a test string with multiple words';
    const truncated = truncateToTokens(text, 5, 'middle');
    expect(truncated.length).toBeLessThanOrEqual(text.length);
  });

  it('should handle truncation modes', () => {
    const text = 'This is a test string with several tokens to truncate';
    const middle = truncateToTokens(text, 5, 'middle');
    const start = truncateToTokens(text, 5, 'start');
    const end = truncateToTokens(text, 5, 'end');
    
    expect(middle.length).toBeLessThanOrEqual(text.length);
    expect(start.length).toBeLessThanOrEqual(text.length);
    expect(end.length).toBeLessThanOrEqual(text.length);
    expect(middle.length).toBeGreaterThan(0);
    expect(start.length).toBeGreaterThan(0);
    expect(end.length).toBeGreaterThan(0);
  });

  it('should return original text if within limit', () => {
    const text = 'Short text';
    const truncated = truncateToTokens(text, 100, 'middle');
    expect(truncated).toBe(text);
  });
});

describe('Hash Utilities', () => {
  it('should generate consistent hashes', () => {
    const text = 'test string';
    const hash1 = sha256(text);
    const hash2 = sha256(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate different hashes for different inputs', () => {
    const hash1 = sha256('string1');
    const hash2 = sha256('string2');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty strings', () => {
    const hash = sha256('');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Default Budget', () => {
  it('should have valid budget structure', () => {
    expect(DEFAULT_BUDGET.totalTokens).toBeGreaterThan(0);
    expect(DEFAULT_BUDGET.caps).toBeDefined();
    expect(DEFAULT_BUDGET.truncation).toBeDefined();
  });

  it('should have reasonable token caps', () => {
    const caps = DEFAULT_BUDGET.caps;
    expect(caps.intent_summary).toBeGreaterThan(0);
    expect(caps.product_overview).toBeGreaterThan(0);
    expect(caps.project_meta).toBeGreaterThan(0);
    expect(caps.api_signatures).toBeGreaterThan(0);
    expect(caps.recent_diffs).toBeGreaterThan(0);
    expect(caps.docs_overview).toBeGreaterThan(0);
    expect(caps.impl_snippets).toBeGreaterThan(0);
    expect(caps.configs_profiles).toBeGreaterThan(0);
  });

  it('should have valid truncation mode', () => {
    const validModes = ['start', 'middle', 'end'];
    expect(validModes).toContain(DEFAULT_BUDGET.truncation);
  });
});

