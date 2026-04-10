/**
 * Tests for mathematical utility functions
 */

import { describe, it, expect } from 'vitest';
import { cosineSimilarity, dotProduct, magnitude, normalize } from './math';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('should return 0 for vectors with different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should return 0 for zero magnitude vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should calculate correct similarity for known vectors', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // Expected: (1*4 + 2*5 + 3*6) / (sqrt(14) * sqrt(77))
    // = 32 / (3.742 * 8.775) = 0.974
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.974, 2);
  });

  it('should handle negative values', () => {
    const a = [1, -2, 3];
    const b = [-1, 2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('should handle sparse vectors with undefined values', () => {
    const a = [1, 2, undefined as unknown as number, 4];
    const b = [1, undefined as unknown as number, 3, 4];
    // Should treat undefined as 0
    const result = cosineSimilarity(a, b);
    expect(result).toBeGreaterThan(0);
  });
});

describe('dotProduct', () => {
  it('should calculate dot product correctly', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(dotProduct(a, b)).toBe(32); // 1*4 + 2*5 + 3*6 = 32
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(dotProduct(a, b)).toBe(0);
  });

  it('should return 0 for different length vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(dotProduct(a, b)).toBe(0);
  });

  it('should handle negative values', () => {
    const a = [1, -2];
    const b = [-1, 2];
    expect(dotProduct(a, b)).toBe(-5); // 1*(-1) + (-2)*2 = -5
  });
});

describe('magnitude', () => {
  it('should calculate magnitude correctly', () => {
    const vec = [3, 4];
    expect(magnitude(vec)).toBe(5); // sqrt(9 + 16) = 5
  });

  it('should return 0 for zero vector', () => {
    const vec = [0, 0, 0];
    expect(magnitude(vec)).toBe(0);
  });

  it('should handle negative values', () => {
    const vec = [-3, -4];
    expect(magnitude(vec)).toBe(5); // sqrt(9 + 16) = 5
  });

  it('should handle single dimension', () => {
    const vec = [5];
    expect(magnitude(vec)).toBe(5);
  });
});

describe('normalize', () => {
  it('should normalize vector to unit length', () => {
    const vec = [3, 4];
    const normalized = normalize(vec);
    expect(normalized[0]).toBeCloseTo(0.6); // 3/5
    expect(normalized[1]).toBeCloseTo(0.8); // 4/5
    expect(magnitude(normalized)).toBeCloseTo(1.0);
  });

  it('should return original vector if magnitude is 0', () => {
    const vec = [0, 0, 0];
    expect(normalize(vec)).toEqual(vec);
  });

  it('should handle already normalized vector', () => {
    const vec = [1, 0];
    const normalized = normalize(vec);
    expect(normalized).toEqual([1, 0]);
  });

  it('should handle negative values', () => {
    const vec = [-3, -4];
    const normalized = normalize(vec);
    expect(normalized[0]).toBeCloseTo(-0.6);
    expect(normalized[1]).toBeCloseTo(-0.8);
  });
});
