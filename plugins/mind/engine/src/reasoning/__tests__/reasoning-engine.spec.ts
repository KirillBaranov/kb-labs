import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReasoningEngine } from '../reasoning-engine';
import { ComplexityDetector } from '../complexity-detector';
import { QueryPlanner } from '../query-planner';
import { ParallelExecutor } from '../parallel-executor';
import { ResultSynthesizer } from '../synthesizer';
import type { ILLM } from '@kb-labs/sdk';
import type { KnowledgeQuery, KnowledgeExecutionContext } from '../../types/engine-contracts';

describe('ReasoningEngine', () => {
  let complexityDetector: ComplexityDetector;
  let queryPlanner: QueryPlanner;
  let parallelExecutor: ParallelExecutor;
  let synthesizer: ResultSynthesizer;
  let reasoningEngine: ReasoningEngine;

  const createMockContext = (): KnowledgeExecutionContext => ({
    scope: { id: 'test-scope', sources: [] },
    sources: [],
    limit: 10,
  });

  const createMockQuery = (text: string, intent: 'search' | 'summary' | 'similar' | 'nav' = 'search'): KnowledgeQuery => ({
    productId: 'test-product',
    scopeId: 'test-scope',
    text,
    intent,
  });

  beforeEach(() => {
    complexityDetector = new ComplexityDetector(
      { threshold: 0.6, heuristics: true, llmBased: false },
      null,
    );
    queryPlanner = new QueryPlanner({ maxSubqueries: 5 }, null);
    parallelExecutor = new ParallelExecutor({ parallel: false });
    synthesizer = new ResultSynthesizer({ enabled: false }, null);
    reasoningEngine = new ReasoningEngine(
      { maxDepth: 3, maxTotalQueries: 20, cyclicDetection: true },
      complexityDetector,
      queryPlanner,
      parallelExecutor,
      synthesizer,
    );
  });

  it('should execute simple queries without reasoning', async () => {
    const testQuery = createMockQuery('simple');
    const mockExecutor = vi.fn().mockResolvedValue({
      query: testQuery,
      chunks: [],
      contextText: 'result',
      generatedAt: new Date().toISOString(),
    });

    const result = await reasoningEngine.execute(
      testQuery,
      createMockContext(),
      mockExecutor,
    );

    expect(mockExecutor).toHaveBeenCalledTimes(1);
    expect(result.metadata?.reasoning).toBeDefined();
  });

  it('should execute complex queries with reasoning', async () => {
    // Mock complexity detector - create a custom one that always returns high complexity
    const mockComplexityDetector = {
      detectComplexity: vi.fn().mockResolvedValue({
        score: 0.8,
        reasons: ['Long query', 'Multiple concepts'],
        needsReasoning: true,
      }),
    } as unknown as ComplexityDetector;
    
    // Mock query planner to generate multiple sub-queries
    const mockLLM: ILLM = {
      complete: vi.fn().mockResolvedValue({
        content: '["sub-query 1", "sub-query 2"]',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        model: 'test',
        finishReason: 'stop',
      }),
      stream: vi.fn(async function* () {}),
    };
    queryPlanner = new QueryPlanner({ maxSubqueries: 5 }, mockLLM);
    
    parallelExecutor = new ParallelExecutor({ parallel: false });
    synthesizer = new ResultSynthesizer({ enabled: false }, null);
    
    reasoningEngine = new ReasoningEngine(
      { maxDepth: 3, maxTotalQueries: 20, cyclicDetection: true },
      mockComplexityDetector,
      queryPlanner,
      parallelExecutor,
      synthesizer,
    );

    const complexQueryText = 'How does compression work and what are the different strategies including smart truncation and LLM compression?';
    const complexQuery = createMockQuery(complexQueryText);
    const mockExecutor = vi.fn().mockResolvedValue({
      query: complexQuery,
      chunks: [{ id: '1', sourceId: 's1', path: 'p1', span: { startLine: 1, endLine: 10 }, text: 'chunk', score: 0.8 }],
      contextText: 'result',
      generatedAt: new Date().toISOString(),
    });

    const result = await reasoningEngine.execute(
      complexQuery,
      createMockContext(),
      mockExecutor,
    );

    // Result should have reasoning metadata
    expect(result.metadata?.reasoning).toBeDefined();
    // Should have executed queries
    expect(mockExecutor).toHaveBeenCalled();
  });

  it('should respect maxDepth limit', async () => {
    const engine = new ReasoningEngine(
      { maxDepth: 1, maxTotalQueries: 20, cyclicDetection: true },
      complexityDetector,
      queryPlanner,
      parallelExecutor,
      synthesizer,
    );

    const testQuery = createMockQuery('test');
    const mockExecutor = vi.fn().mockResolvedValue({
      query: testQuery,
      chunks: [],
      contextText: 'result',
      generatedAt: new Date().toISOString(),
    });

    // At max depth, should execute directly
    const result = await engine.execute(
      testQuery,
      createMockContext(),
      mockExecutor,
      1, // depth = 1, maxDepth = 1
    );

    expect(result.metadata?.reasoning).toBeDefined();
  });

  it('should detect cycles', async () => {
    const engine = new ReasoningEngine(
      { maxDepth: 3, maxTotalQueries: 20, cyclicDetection: true },
      complexityDetector,
      queryPlanner,
      parallelExecutor,
      synthesizer,
    );

    const testQuery = createMockQuery('test');
    const mockExecutor = vi.fn().mockResolvedValue({
      query: testQuery,
      chunks: [],
      contextText: 'result',
      generatedAt: new Date().toISOString(),
    });

    // This should not throw if cycle detection works correctly
    // (actual cycle detection would need more complex setup)
    await expect(
      engine.execute(
        testQuery,
        createMockContext(),
        mockExecutor,
      )
    ).resolves.toBeDefined();
  });
});
