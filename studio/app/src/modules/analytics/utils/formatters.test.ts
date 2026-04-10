/**
 * @module analytics/utils/formatters.test
 * Tests for analytics formatters
 */

import { describe, it, expect } from 'vitest';
import { formatCost } from './formatters';

describe('formatCost', () => {
  describe('real backend data - single LLM calls', () => {
    it('should format very small costs (individual API calls)', () => {
      // Real data from events-20260116.jsonl
      expect(formatCost(0.000043349999999999997)).toBe('$4.33e-5'); // 145+36 tokens
      expect(formatCost(0.00008730000000000001)).toBe('$8.73e-5'); // 234+87 tokens
      expect(formatCost(0.0005536499999999999)).toBe('$0.000554'); // 2847+211 tokens
      expect(formatCost(0.0001407)).toBe('$0.000141'); // 514+106 tokens
    });

    it('should format slightly larger costs', () => {
      expect(formatCost(0.00028695)).toBe('$0.000287'); // Original bug example
      expect(formatCost(0.000044399999999999995)).toBe('$4.44e-5'); // 160+34 tokens
    });
  });

  describe('aggregated daily costs', () => {
    it('should format daily totals', () => {
      // Simulate 100 small API calls per day
      const dailyTotal = 0.000043 * 100; // ≈ $0.0043
      expect(formatCost(dailyTotal)).toBe('$0.004300');

      // Simulate 1000 small API calls per day
      const largeDailyTotal = 0.000043 * 1000; // ≈ $0.043
      expect(formatCost(largeDailyTotal)).toBe('$0.0430');
    });

    it('should format typical production daily costs', () => {
      expect(formatCost(0.001)).toBe('$0.001000'); // 6 decimals for $0.001
      expect(formatCost(0.01)).toBe('$0.0100'); // 4 decimals for $0.01
      expect(formatCost(0.1)).toBe('$0.1000'); // 4 decimals for $0.10
      expect(formatCost(1.5)).toBe('$1.50'); // 2 decimals for $1.50
      expect(formatCost(10.99)).toBe('$10.99'); // 2 decimals for $10.99
    });
  });

  describe('edge cases', () => {
    it('should handle zero cost', () => {
      expect(formatCost(0)).toBe('$0.00');
    });

    it('should handle very tiny costs (scientific notation)', () => {
      expect(formatCost(0.00000012)).toBe('$1.20e-7');
      expect(formatCost(0.000000001)).toBe('$1.00e-9');
    });

    it('should handle large costs', () => {
      expect(formatCost(100.456)).toBe('$100.46');
      expect(formatCost(1000.123)).toBe('$1000.12');
    });
  });

  describe('precision thresholds', () => {
    it('should use 2 decimals for >= $1', () => {
      expect(formatCost(1)).toBe('$1.00');
      expect(formatCost(1.234)).toBe('$1.23');
      expect(formatCost(1.235)).toBe('$1.24'); // Rounds up
    });

    it('should use 4 decimals for >= $0.01', () => {
      expect(formatCost(0.01)).toBe('$0.0100');
      expect(formatCost(0.012345)).toBe('$0.0123');
      expect(formatCost(0.012355)).toBe('$0.0124'); // Rounds up
    });

    it('should use 6 decimals for >= $0.0001', () => {
      expect(formatCost(0.0001)).toBe('$0.000100');
      expect(formatCost(0.00012345)).toBe('$0.000123');
      expect(formatCost(0.00012355)).toBe('$0.000124'); // Rounds up
    });

    it('should use scientific notation for < $0.0001', () => {
      expect(formatCost(0.00009999)).toBe('$1.00e-4');
      expect(formatCost(0.00001)).toBe('$1.00e-5');
    });
  });

  describe('what we expect to see in the chart tooltip', () => {
    it('should show readable values for typical daily aggregates', () => {
      // If we have 10 requests/day with avg $0.00028695 each
      const cost = 10 * 0.00028695; // = $0.0028695
      expect(formatCost(cost)).toBe('$0.002870'); // 6 decimals, readable

      // If we have 100 requests/day
      const cost100 = 100 * 0.00028695; // = $0.028695
      expect(formatCost(cost100)).toBe('$0.0287'); // 4 decimals, readable

      // If we have 1000 requests/day
      const cost1000 = 1000 * 0.00028695; // = $0.28695
      expect(formatCost(cost1000)).toBe('$0.2869'); // 4 decimals, readable (rounds down)
    });

    it('should NOT show $0.00 for small but non-zero values', () => {
      // These should all be visible (not $0.00)
      expect(formatCost(0.00028695)).not.toBe('$0.00');
      expect(formatCost(0.000043)).not.toBe('$0.00');
      expect(formatCost(0.001)).not.toBe('$0.00');
    });
  });

  describe('real world scenario: what chart shows on Jan 16', () => {
    it('should handle sum of all LLM calls on Jan 16', () => {
      // Sample from real data:
      const costs = [
        0.000043349999999999997,
        0.000043349999999999997,
        0.00008730000000000001,
        0.0005536499999999999,
        0.0001407,
      ];

      const total = costs.reduce((sum, c) => sum + c, 0);
      // Total ≈ 0.00086265

      const formatted = formatCost(total);

      // Should be visible with 6 decimals
      expect(formatted).toBe('$0.000868'); // Actual rounded value

      // Should NOT be $0.00
      expect(formatted).not.toBe('$0.00');

      // Should NOT be scientific notation (since > $0.0001)
      expect(formatted).not.toContain('e');
    });

    it('should handle very low daily total (few requests)', () => {
      // If only 2-3 requests on a day
      const lowDailyTotal = 0.000043 + 0.000087; // $0.00013

      const formatted = formatCost(lowDailyTotal);

      // Should use 6 decimals (since >= $0.0001)
      expect(formatted).toBe('$0.000130');

      // Should NOT be $0.00
      expect(formatted).not.toBe('$0.00');
    });
  });
});
