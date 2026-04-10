import { describe, it, expect, vi } from 'vitest';
import { ComplexityDetector } from '../complexity-detector';
import type { ILLM } from '@kb-labs/sdk';

describe('ComplexityDetector', () => {
  describe('heuristic detection', () => {
    it('should detect simple queries as low complexity', async () => {
      const detector = new ComplexityDetector(
        { threshold: 0.6, heuristics: true, llmBased: false },
        null,
      );

      const result = await detector.detectComplexity('test');
      expect(result.score).toBeLessThan(0.6);
      expect(result.needsReasoning).toBe(false);
    });

    it('should detect long queries as high complexity', async () => {
      const detector = new ComplexityDetector(
        { threshold: 0.6, heuristics: true, llmBased: false },
        null,
      );

      const longQuery = 'How does the compression system work and what are the different strategies for token optimization including smart truncation metadata-only mode and LLM compression techniques?';
      const result = await detector.detectComplexity(longQuery);
      expect(result.score).toBeGreaterThan(0.6);
      expect(result.needsReasoning).toBe(true);
    });

    it('should detect multi-concept queries as complex', async () => {
      const detector = new ComplexityDetector(
        { threshold: 0.6, heuristics: true, llmBased: false },
        null,
      );

      const multiConceptQuery = 'How does compression work and what are the differences between smart truncation and LLM compression?';
      const result = await detector.detectComplexity(multiConceptQuery);
      expect(result.score).toBeGreaterThan(0.4);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('LLM-based detection', () => {
    it('should use LLM when enabled', async () => {
      const mockLLM: ILLM = {
        complete: vi.fn().mockResolvedValue({
          content: '{"score": 0.7, "reason": "test"}',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          model: 'test',
          finishReason: 'stop',
        }),
        stream: vi.fn(async function* () {}),
      };

      const detector = new ComplexityDetector(
        { threshold: 0.6, heuristics: true, llmBased: true },
        mockLLM,
      );

      const result = await detector.detectComplexity('test query');
      expect(mockLLM.complete).toHaveBeenCalled();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    });

    it('should fallback to heuristics if LLM fails', async () => {
      const mockLLM: ILLM = {
        complete: vi.fn().mockRejectedValue(new Error('LLM error')),
        stream: vi.fn(async function* () {}),
      };

      const detector = new ComplexityDetector(
        { threshold: 0.6, heuristics: true, llmBased: true },
        mockLLM,
      );

      const result = await detector.detectComplexity('test');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      // Should have reasons (either from heuristics or LLM failure message)
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });
});
