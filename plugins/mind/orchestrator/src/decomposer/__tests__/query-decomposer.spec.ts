import { describe, expect, it } from 'vitest';
import { QueryDecomposer } from '../query-decomposer';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../../types';

function createMockLLM(subqueries: string[]) {
  return {
    async complete() {
      return {
        content: JSON.stringify({
          subqueries,
          reasoning: 'mock',
        }),
      };
    },
  } as any;
}

describe('QueryDecomposer', () => {
  it('classifies technical "what is <Identifier>" lookup as simple/instant', async () => {
    const decomposer = new QueryDecomposer({
      llm: createMockLLM(['unused']),
      config: {
        ...DEFAULT_ORCHESTRATOR_CONFIG,
        autoDetectComplexity: false,
      },
    });

    const complexity = await decomposer.detectComplexity(
      'What is VectorStore interface and what methods does it have?',
    );
    expect(complexity.suggestedMode).toBe('instant');
    expect(complexity.level).toBe('simple');
  });

  it('classifies short debug lookup as simple/instant to avoid noisy decomposition', async () => {
    const decomposer = new QueryDecomposer({
      llm: createMockLLM(['unused']),
      config: {
        ...DEFAULT_ORCHESTRATOR_CONFIG,
        autoDetectComplexity: false,
      },
    });

    const complexity = await decomposer.detectComplexity(
      'How embedding stage handles invalid input chunks',
    );
    expect(complexity.suggestedMode).toBe('instant');
    expect(complexity.level).toBe('simple');
  });

  it('preserves simple/instant heuristic even when autoDetectComplexity is enabled', async () => {
    const decomposer = new QueryDecomposer({
      llm: createMockLLM(['unused']),
      config: {
        ...DEFAULT_ORCHESTRATOR_CONFIG,
        autoDetectComplexity: true,
        mode: 'auto',
      },
    });

    const complexity = await decomposer.detectComplexity(
      'What is VectorStore interface and what methods does it have?',
    );
    expect(complexity.suggestedMode).toBe('instant');
    expect(complexity.level).toBe('simple');
  });

  it('always keeps original query in decomposition output', async () => {
    const decomposer = new QueryDecomposer({
      llm: createMockLLM([
        'where is conflict resolution policy implemented',
        'how freshness-first works',
      ]),
      config: {
        ...DEFAULT_ORCHESTRATOR_CONFIG,
        mode: 'thinking',
      },
    });

    const original = 'conflict resolution freshness-first policy maxLosersPerTopic penalty';
    const result = await decomposer.decompose(original, 'thinking');

    expect(result.subqueries[0]).toBe(original);
    expect(result.subqueries).toContain(original);
  });

  it('respects maxSubqueries while preserving original query', async () => {
    const decomposer = new QueryDecomposer({
      llm: createMockLLM([
        'query a',
        'query b',
        'query c',
      ]),
      config: {
        ...DEFAULT_ORCHESTRATOR_CONFIG,
        mode: 'thinking',
        modes: {
          ...DEFAULT_ORCHESTRATOR_CONFIG.modes,
          thinking: {
            ...DEFAULT_ORCHESTRATOR_CONFIG.modes.thinking,
            maxSubqueries: 2,
          },
        },
      },
    });

    const original = 'Explain conflict policy and freshness strategy for maxLosersPerTopic with implementation details and tradeoffs across competing documents';
    const result = await decomposer.decompose(original, 'thinking');

    expect(result.subqueries.length).toBe(2);
    expect(result.subqueries[0]).toBe(original);
  });
});
