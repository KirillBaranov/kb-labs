import { describe, expect, it } from 'vitest';
import { classifyQuery, classifyQueryWithLLMFallback, extractIdentifiers } from '../query-classifier';

describe('query-classifier retrieval profile', () => {
  it('uses exact_lookup for identifier-centric lookup query', () => {
    const classification = classifyQuery('What is VectorStore interface?');
    expect(classification.type).toBe('lookup');
    expect(classification.retrievalProfile).toBe('exact_lookup');
    expect(classification.weights.keyword).toBeGreaterThan(classification.weights.vector);
  });

  it('uses semantic_explore for conceptual query', () => {
    const classification = classifyQuery('How does hybrid search architecture work?');
    expect(classification.retrievalProfile).toBe('semantic_explore');
    expect(classification.weights.vector).toBeGreaterThan(classification.weights.keyword);
  });

  it('uses exact_lookup for CLI command lookup query', () => {
    const classification = classifyQuery('Which stats are returned by rag-index command');
    expect(classification.retrievalProfile).toBe('exact_lookup');
    expect(classification.weights.keyword).toBeGreaterThan(classification.weights.vector);
  });
});

describe('extractIdentifiers', () => {
  it('does not treat sentence words as technical identifiers', () => {
    const identifiers = extractIdentifiers('What is VectorStore interface?');
    expect(identifiers).toContain('VectorStore');
    expect(identifiers).not.toContain('What');
  });

  it('extracts kebab-case command identifiers', () => {
    const identifiers = extractIdentifiers('Which stats are returned by rag-index command');
    expect(identifiers).toContain('rag-index');
  });
});

describe('classifyQueryWithLLMFallback', () => {
  it('uses LLM tool-call decision in uncertainty band', async () => {
    const llm = {
      async complete() {
        return { content: '', usage: { promptTokens: 0, completionTokens: 0 }, model: 'mock' };
      },
      async *stream() {
        yield '';
      },
      async chatWithTools() {
        return {
          content: '',
          usage: { promptTokens: 1, completionTokens: 1 },
          model: 'mock',
          toolCalls: [
            {
              id: 'tool-1',
              name: 'set_query_profile',
              input: {
                profile: 'semantic_explore',
                confidence: 0.9,
                recallStrategy: 'broad_recall',
              },
            },
          ],
        };
      },
    };

    const classification = await classifyQueryWithLLMFallback(
      'Explain tradeoffs and why this approach was chosen',
      { enabled: true, llm },
    );

    expect(classification.retrievalProfile).toBe('semantic_explore');
    expect(classification.recallStrategy).toBe('broad_recall');
  });
});
