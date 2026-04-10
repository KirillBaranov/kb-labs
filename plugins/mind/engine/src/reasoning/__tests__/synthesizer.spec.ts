import { describe, it, expect, vi } from 'vitest';
import { ResultSynthesizer } from '../synthesizer';
import type { ILLM } from '@kb-labs/sdk';
import type { KnowledgeResult, KnowledgeChunk } from '../../types/engine-contracts';

describe('ResultSynthesizer', () => {
  const createMockChunk = (id: string, text: string, score: number = 0.8): KnowledgeChunk => ({
    id,
    sourceId: 'test',
    path: `file${id}.ts`,
    span: { startLine: 1, endLine: 10 },
    text,
    score,
  });

  const createMockResult = (chunks: KnowledgeChunk[]): KnowledgeResult => ({
    query: { productId: 'test-product', scopeId: 'test-scope', text: 'test', intent: 'search' },
    chunks,
    contextText: chunks.map(c => c.text).join('\n'),
    generatedAt: new Date().toISOString(),
  });

  describe('deduplication', () => {
    it('should deduplicate chunks by id', async () => {
      const synthesizer = new ResultSynthesizer(
        { enabled: false, deduplication: true },
        null,
      );

      const chunks = [
        createMockChunk('1', 'chunk 1'),
        createMockChunk('1', 'chunk 1 duplicate'), // Same id
        createMockChunk('2', 'chunk 2'),
      ];

      const results = [createMockResult(chunks)];
      const synthesized = await synthesizer.synthesize(results, 'test query');

      expect(synthesized.deduplicatedChunkCount).toBeLessThan(synthesized.originalChunkCount);
      expect(synthesized.chunks.length).toBe(2);
    });

    it('should deduplicate chunks by text similarity', async () => {
      const synthesizer = new ResultSynthesizer(
        { enabled: false, deduplication: true },
        null,
      );

      const chunks = [
        createMockChunk('1', 'This is a test chunk with some content'),
        createMockChunk('2', 'This is a test chunk with some content'), // Very similar
        createMockChunk('3', 'Different content entirely'),
      ];

      const results = [createMockResult(chunks)];
      const synthesized = await synthesizer.synthesize(results, 'test query');

      expect(synthesized.deduplicatedChunkCount).toBeLessThan(synthesized.originalChunkCount);
    });
  });

  describe('LLM synthesis', () => {
    it('should use LLM when enabled', async () => {
      const mockLLM: ILLM = {
        complete: vi.fn().mockResolvedValue({
          content: 'Synthesized context from chunks',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          model: 'test',
          finishReason: 'stop',
        }),
        stream: vi.fn(async function* () {}),
      };

      const synthesizer = new ResultSynthesizer(
        { enabled: true, deduplication: true },
        mockLLM,
      );

      const chunks = [
        createMockChunk('1', 'chunk 1'),
        createMockChunk('2', 'chunk 2'),
      ];

      const results = [createMockResult(chunks)];
      const synthesized = await synthesizer.synthesize(results, 'test query');

      expect(mockLLM.complete).toHaveBeenCalled();
      expect(synthesized.contextText).toBe('Synthesized context from chunks');
    });

    it('should fallback to concatenation if LLM fails', async () => {
      const mockLLM: ILLM = {
        complete: vi.fn().mockRejectedValue(new Error('LLM error')),
        stream: vi.fn(async function* () {}),
      };

      const synthesizer = new ResultSynthesizer(
        { enabled: true, deduplication: true },
        mockLLM,
      );

      const chunks = [
        createMockChunk('1', 'chunk 1'),
        createMockChunk('2', 'chunk 2'),
      ];

      const results = [createMockResult(chunks)];
      const synthesized = await synthesizer.synthesize(results, 'test query');

      expect(synthesized.contextText).toContain('chunk 1');
      expect(synthesized.contextText).toContain('chunk 2');
    });
  });

  describe('chunk sorting', () => {
    it('should sort chunks by score descending', async () => {
      const synthesizer = new ResultSynthesizer(
        { enabled: false, deduplication: false },
        null,
      );

      const chunks = [
        createMockChunk('1', 'low score', 0.3),
        createMockChunk('2', 'high score', 0.9),
        createMockChunk('3', 'medium score', 0.6),
      ];

      const results = [createMockResult(chunks)];
      const synthesized = await synthesizer.synthesize(results, 'test query');

      expect(synthesized.chunks[0]!.score).toBe(0.9);
      expect(synthesized.chunks[1]!.score).toBe(0.6);
      expect(synthesized.chunks[2]!.score).toBe(0.3);
    });
  });
});

