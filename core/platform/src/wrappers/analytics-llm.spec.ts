/**
 * @module @kb-labs/core-platform/wrappers/__tests__/analytics-llm
 * Tests for AnalyticsLLM wrapper cost calculation
 */

import { describe, it, expect } from 'vitest';

/**
 * Extract estimateCost logic for testing
 * This mirrors the implementation in analytics-llm.ts
 */
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const modelLower = model.toLowerCase();

  // Pricing map (input / output per 1M tokens)
  const pricing: Record<string, { input: number; output: number }> = {
    // OpenAI models (2025-01 pricing)
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },

    // Claude models (2025-01 pricing)
    'claude-3-opus': { input: 15.00, output: 75.00 },
    'claude-3-sonnet': { input: 3.00, output: 15.00 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
  };

  // Sort keys by length (longest first)
  const sortedKeys = Object.keys(pricing).sort((a, b) => b.length - a.length);

  // Find matching pricing
  let modelPricing = pricing['gpt-4o-mini']!; // Default
  for (const key of sortedKeys) {
    if (modelLower.includes(key)) {
      modelPricing = pricing[key]!;
      break;
    }
  }

  // Calculate cost (per 1M tokens)
  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;

  return inputCost + outputCost;
}

describe('AnalyticsLLM - Cost Estimation', () => {
  describe('Versioned Model Name Matching', () => {
    it('should match gpt-4o-mini-2024-07-18 to gpt-4o-mini pricing', () => {
      const cost = estimateCost('gpt-4o-mini-2024-07-18', 186, 138);
      const expected = (186 / 1_000_000) * 0.15 + (138 / 1_000_000) * 0.60;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.0001107, 7);
    });

    it('should match gpt-4o-2024-05-13 to gpt-4o pricing', () => {
      const cost = estimateCost('gpt-4o-2024-05-13', 186, 138);
      const expected = (186 / 1_000_000) * 2.50 + (138 / 1_000_000) * 10.00;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.001845, 5);
    });

    it('should match gpt-4-turbo-2024-04-09 to gpt-4-turbo pricing', () => {
      const cost = estimateCost('gpt-4-turbo-2024-04-09', 186, 138);
      const expected = (186 / 1_000_000) * 10.00 + (138 / 1_000_000) * 30.00;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.00600, 5);
    });

    it('should match gpt-4-0125-preview to gpt-4 pricing', () => {
      const cost = estimateCost('gpt-4-0125-preview', 186, 138);
      const expected = (186 / 1_000_000) * 30.00 + (138 / 1_000_000) * 60.00;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.01386, 5);
    });

    it('should match claude-3-opus-20240229 to claude-3-opus pricing', () => {
      const cost = estimateCost('claude-3-opus-20240229', 186, 138);
      const expected = (186 / 1_000_000) * 15.00 + (138 / 1_000_000) * 75.00;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.01314, 4);
    });
  });

  describe('Model Name Priority (Longest First)', () => {
    it('should NOT match gpt-4o-mini-2024-07-18 to gpt-4o (wrong)', () => {
      const cost = estimateCost('gpt-4o-mini-2024-07-18', 186, 138);
      const wrongCost = (186 / 1_000_000) * 2.50 + (138 / 1_000_000) * 10.00; // gpt-4o pricing
      expect(cost).not.toBeCloseTo(wrongCost, 6);
    });

    it('should match gpt-4o-mini before gpt-4o due to sorting', () => {
      const miniCost = estimateCost('gpt-4o-mini', 100, 100);
      const expectedMini = (100 / 1_000_000) * 0.15 + (100 / 1_000_000) * 0.60;
      expect(miniCost).toBeCloseTo(expectedMini, 8);
    });
  });

  describe('Fallback for Unknown Models', () => {
    it('should use gpt-4o-mini pricing for unknown models', () => {
      const cost = estimateCost('unknown-model-xyz', 186, 138);
      const expected = (186 / 1_000_000) * 0.15 + (138 / 1_000_000) * 0.60;
      expect(cost).toBeCloseTo(expected, 8);
    });
  });

  describe('Cost Calculation Precision', () => {
    it('should calculate cost per 1M tokens, not 1K tokens', () => {
      const cost = estimateCost('gpt-4o-mini', 1_000_000, 1_000_000);
      const expected = 1 * 0.15 + 1 * 0.60; // Should be $0.75
      expect(cost).toBeCloseTo(expected, 2);
      expect(cost).toBeCloseTo(0.75, 2);
    });

    it('should handle small token counts without rounding to zero', () => {
      const cost = estimateCost('gpt-4o-mini', 100, 100);
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeCloseTo(0.000075, 7);
    });
  });

  describe('Case Insensitivity', () => {
    it('should match uppercase model names', () => {
      const cost = estimateCost('GPT-4O-MINI-2024-07-18', 186, 138);
      const expected = (186 / 1_000_000) * 0.15 + (138 / 1_000_000) * 0.60;
      expect(cost).toBeCloseTo(expected, 8);
    });

    it('should match mixed case model names', () => {
      const cost = estimateCost('Claude-3-Opus-20240229', 186, 138);
      const expected = (186 / 1_000_000) * 15.00 + (138 / 1_000_000) * 75.00;
      expect(cost).toBeCloseTo(expected, 8);
    });
  });

  describe('Real-world Examples', () => {
    it('should calculate realistic cost for typical query (gpt-4o-mini)', () => {
      // Typical Mind RAG query: ~2000 prompt, ~500 completion
      const cost = estimateCost('gpt-4o-mini-2024-07-18', 2000, 500);
      const expected = (2000 / 1_000_000) * 0.15 + (500 / 1_000_000) * 0.60;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.0006, 5); // ~$0.0006 per query
    });

    it('should calculate realistic cost for expensive model (gpt-4)', () => {
      const cost = estimateCost('gpt-4-0125-preview', 2000, 500);
      const expected = (2000 / 1_000_000) * 30.00 + (500 / 1_000_000) * 60.00;
      expect(cost).toBeCloseTo(expected, 8);
      expect(cost).toBeCloseTo(0.09, 2); // ~$0.09 per query
    });
  });
});
