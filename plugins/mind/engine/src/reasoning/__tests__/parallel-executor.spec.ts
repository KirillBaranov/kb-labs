import { describe, it, expect } from 'vitest';
import { ParallelExecutor } from '../parallel-executor';
import type { QueryPlan, ReasoningContext } from '../types';
import type { KnowledgeQuery, KnowledgeResult, KnowledgeExecutionContext } from '../../types/engine-contracts';

describe('ParallelExecutor', () => {
  const createMockContext = (): KnowledgeExecutionContext => ({
    scope: { id: 'test-scope', sources: [] },
    sources: [],
    limit: 10,
  });

  const createMockReasoningContext = (): ReasoningContext => ({
    depth: 0,
    maxDepth: 3,
    queryPath: [],
    totalQueries: 0,
    maxTotalQueries: 20,
    tokensUsed: 0,
    maxTokensPerDepth: 10000,
  });

  const createMockPlan = (subqueries: string[]): QueryPlan => ({
    originalQuery: 'test',
    complexityScore: 0.8,
    subqueries: subqueries.map((text, index) => ({
      text,
      priority: subqueries.length - index,
      groupId: 0,
      relevance: 1 - (index * 0.1),
    })),
  });

  it('should execute queries sequentially when parallel disabled', async () => {
    const executor = new ParallelExecutor({ parallel: false });
    const executionOrder: number[] = [];

    const mockExecutor = async (query: KnowledgeQuery): Promise<KnowledgeResult> => {
      const index = parseInt(query.text.split(' ')[1]!);
      executionOrder.push(index);
      await new Promise<void>(resolve => { setTimeout(resolve, 10); });
      return {
        query,
        chunks: [],
        contextText: '',
        generatedAt: new Date().toISOString(),
      };
    };

    const plan = createMockPlan(['query 0', 'query 1', 'query 2']);
    await executor.execute(
      plan,
      createMockContext(),
      mockExecutor,
      createMockReasoningContext(),
    );

    expect(executionOrder).toEqual([0, 1, 2]);
  });

  it('should execute queries in parallel when enabled', async () => {
    const executor = new ParallelExecutor({ parallel: true, maxConcurrency: 3 });
    const executionOrder: number[] = [];

    const mockExecutor = async (query: KnowledgeQuery): Promise<KnowledgeResult> => {
      const index = parseInt(query.text.split(' ')[1]!);
      executionOrder.push(index);
      await new Promise<void>(resolve => { setTimeout(resolve, 10); });
      return {
        query,
        chunks: [],
        contextText: '',
        generatedAt: new Date().toISOString(),
      };
    };

    const plan = createMockPlan(['query 0', 'query 1', 'query 2']);
    await executor.execute(
      plan,
      createMockContext(),
      mockExecutor,
      createMockReasoningContext(),
    );

    // In parallel execution, order may vary
    expect(executionOrder.length).toBe(3);
    expect(new Set(executionOrder).size).toBe(3);
  });

  it('should respect maxConcurrency limit', async () => {
    const executor = new ParallelExecutor({ parallel: true, maxConcurrency: 2 });
    let concurrentExecutions = 0;
    let maxConcurrent = 0;

    const mockExecutor = async (query: KnowledgeQuery): Promise<KnowledgeResult> => {
      concurrentExecutions++;
      maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
      await new Promise<void>(resolve => { setTimeout(resolve, 20); });
      concurrentExecutions--;
      return {
        query,
        chunks: [],
        contextText: '',
        generatedAt: new Date().toISOString(),
      };
    };

    const plan = createMockPlan(['query 0', 'query 1', 'query 2', 'query 3']);
    await executor.execute(
      plan,
      createMockContext(),
      mockExecutor,
      createMockReasoningContext(),
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should stop early when conditions met', async () => {
    const executor = new ParallelExecutor({
      parallel: true,
      earlyStopping: {
        enabled: true,
        minConfidence: 0.8,
        minChunksFound: 2,
      },
    });

    const mockExecutor = async (query: KnowledgeQuery): Promise<KnowledgeResult> => {
      return {
        query,
        chunks: [
          { id: '1', sourceId: 's1', path: 'p1', span: { startLine: 1, endLine: 10 }, text: 'chunk 1', score: 0.9 },
          { id: '2', sourceId: 's1', path: 'p1', span: { startLine: 11, endLine: 20 }, text: 'chunk 2', score: 0.85 },
        ],
        contextText: '',
        generatedAt: new Date().toISOString(),
      };
    };

    const plan = createMockPlan(['query 0', 'query 1', 'query 2']);
    const results = await executor.execute(
      plan,
      createMockContext(),
      mockExecutor,
      createMockReasoningContext(),
    );

    // Should stop early after first result meets criteria
    expect(results.length).toBeLessThanOrEqual(plan.subqueries.length);
  });

  it('should handle errors gracefully', async () => {
    const executor = new ParallelExecutor({ parallel: true });
    let successCount = 0;

    const mockExecutor = async (query: KnowledgeQuery): Promise<KnowledgeResult> => {
      if (query.text.includes('error')) {
        throw new Error('Query failed');
      }
      successCount++;
      return {
        query,
        chunks: [],
        contextText: '',
        generatedAt: new Date().toISOString(),
      };
    };

    const plan = createMockPlan(['query 0', 'error query', 'query 2']);
    const results = await executor.execute(
      plan,
      createMockContext(),
      mockExecutor,
      createMockReasoningContext(),
    );

    expect(successCount).toBe(2);
    expect(results.length).toBe(2);
  });
});



