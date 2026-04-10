/**
 * Unit tests for flags helper
 */

import { describe, it, expect } from 'vitest';
import { shouldShowLimits, isTruthyBoolean } from '../../helpers/flags';

describe('isTruthyBoolean', () => {
  describe('Boolean values', () => {
    it('should return true for boolean true', () => {
      expect(isTruthyBoolean(true)).toBe(true);
    });

    it('should return false for boolean false', () => {
      expect(isTruthyBoolean(false)).toBe(false);
    });
  });

  describe('String values', () => {
    it('should accept "true"', () => {
      expect(isTruthyBoolean('true')).toBe(true);
    });

    it('should accept "yes"', () => {
      expect(isTruthyBoolean('yes')).toBe(true);
    });

    it('should accept "y"', () => {
      expect(isTruthyBoolean('y')).toBe(true);
    });

    it('should accept empty string (flag without value)', () => {
      expect(isTruthyBoolean('')).toBe(true);
    });

    it('should accept uppercase', () => {
      expect(isTruthyBoolean('TRUE')).toBe(true);
      expect(isTruthyBoolean('YES')).toBe(true);
      expect(isTruthyBoolean('Y')).toBe(true);
    });

    it('should accept mixed case', () => {
      expect(isTruthyBoolean('TrUe')).toBe(true);
      expect(isTruthyBoolean('YeS')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(isTruthyBoolean('  true  ')).toBe(true);
      expect(isTruthyBoolean('  yes  ')).toBe(true);
      expect(isTruthyBoolean('  y  ')).toBe(true);
      expect(isTruthyBoolean('   ')).toBe(true); // Whitespace trims to empty string
    });

    it('should return false for other strings', () => {
      expect(isTruthyBoolean('false')).toBe(false);
      expect(isTruthyBoolean('no')).toBe(false);
      expect(isTruthyBoolean('n')).toBe(false);
      expect(isTruthyBoolean('0')).toBe(false);
      expect(isTruthyBoolean('1')).toBe(false);
      expect(isTruthyBoolean('random')).toBe(false);
    });
  });

  describe('Other types', () => {
    it('should return false for undefined', () => {
      expect(isTruthyBoolean(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isTruthyBoolean(null)).toBe(false);
    });

    it('should return false for number', () => {
      expect(isTruthyBoolean(0)).toBe(false);
      expect(isTruthyBoolean(1)).toBe(false);
      expect(isTruthyBoolean(123)).toBe(false);
    });

    it('should return false for object', () => {
      expect(isTruthyBoolean({})).toBe(false);
    });

    it('should return false for array', () => {
      expect(isTruthyBoolean([])).toBe(false);
    });
  });
});

describe('shouldShowLimits', () => {
  it('should return true when limit=true', () => {
    expect(shouldShowLimits({ limit: true })).toBe(true);
  });

  it('should return true when limits=true', () => {
    expect(shouldShowLimits({ limits: true })).toBe(true);
  });

  it('should return true when both are truthy', () => {
    expect(shouldShowLimits({ limit: true, limits: true })).toBe(true);
  });

  it('should return true when limit="true"', () => {
    expect(shouldShowLimits({ limit: 'true' })).toBe(true);
  });

  it('should return true when limits="yes"', () => {
    expect(shouldShowLimits({ limits: 'yes' })).toBe(true);
  });

  it('should return true when limit="" (flag without value)', () => {
    expect(shouldShowLimits({ limit: '' })).toBe(true);
  });

  it('should return false when both are false', () => {
    expect(shouldShowLimits({ limit: false, limits: false })).toBe(false);
  });

  it('should return false when both are missing', () => {
    expect(shouldShowLimits({})).toBe(false);
  });

  it('should return false when both are falsy strings', () => {
    expect(shouldShowLimits({ limit: 'false', limits: 'no' })).toBe(false);
  });

  it('should return true if either is truthy', () => {
    expect(shouldShowLimits({ limit: true, limits: false })).toBe(true);
    expect(shouldShowLimits({ limit: false, limits: true })).toBe(true);
  });

  it('should handle other flag names being present', () => {
    expect(shouldShowLimits({ limit: true, debug: true, help: false })).toBe(true);
    expect(shouldShowLimits({ debug: true, help: false })).toBe(false);
  });
});
