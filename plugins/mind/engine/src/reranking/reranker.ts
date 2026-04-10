/**
 * @module @kb-labs/mind-engine/reranking/reranker
 * Re-ranking interface and implementations
 */

import { useLogger } from '@kb-labs/sdk';
import type { VectorSearchMatch } from '../vector-store/vector-store';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';

const getRerankLogger = () => useLogger().child({ category: 'mind:engine:reranking' });

export interface Reranker {
  /**
   * Re-rank search results based on query relevance
   */
  rerank(
    query: string,
    matches: VectorSearchMatch[],
    options?: RerankingOptions,
  ): Promise<VectorSearchMatch[]>;
}

export interface RerankingOptions {
  /**
   * Maximum number of candidates to re-rank
   * Default: 20
   */
  topK?: number;

  /**
   * Minimum score threshold
   * Default: 0
   */
  minScore?: number;

  /**
   * Whether to normalize scores after re-ranking
   * Default: true
   */
  normalize?: boolean;
}

export interface CrossEncoderRerankerOptions {
  /**
   * Model endpoint URL (e.g., OpenAI API, local model)
   */
  endpoint?: string;

  /**
   * API key if required
   */
  apiKey?: string;

  /**
   * Model name/identifier
   */
  model?: string;

  /**
   * Batch size for re-ranking requests
   * Default: 10
   */
  batchSize?: number;

  /**
   * Timeout in milliseconds
   * Default: 30000
   */
  timeout?: number;

  /**
   * Runtime adapter for network requests
   */
  runtime: RuntimeAdapter;
}

/**
 * Cross-encoder re-ranking using LLM API
 * Scores query-chunk pairs for better relevance ranking
 */
export class CrossEncoderReranker implements Reranker {
  private readonly options: Required<Omit<CrossEncoderRerankerOptions, 'apiKey'>> & {
    apiKey?: string;
  };

  constructor(options: CrossEncoderRerankerOptions) {
    this.options = {
      endpoint: options.endpoint ?? 'https://api.openai.com/v1/chat/completions',
      apiKey: options.apiKey,
      model: options.model ?? 'gpt-4o-mini',
      batchSize: options.batchSize ?? 10,
      timeout: options.timeout ?? 30000,
      runtime: options.runtime,
    };
  }

  async rerank(
    query: string,
    matches: VectorSearchMatch[],
    options: RerankingOptions = {},
  ): Promise<VectorSearchMatch[]> {
    const opts = {
      topK: options.topK ?? 20,
      minScore: options.minScore ?? 0,
      normalize: options.normalize ?? true,
    };

    // Limit candidates to topK
    const candidates = matches.slice(0, opts.topK);
    if (candidates.length === 0) {
      return matches;
    }

    // Score candidates using cross-encoder approach
    const scored = await this.scoreCandidates(query, candidates);

    // Filter by minimum score
    const filtered = scored.filter(match => match.score >= opts.minScore);

    // Normalize scores if requested
    if (opts.normalize && filtered.length > 0) {
      const maxScore = Math.max(...filtered.map(m => m.score));
      const minScore = Math.min(...filtered.map(m => m.score));
      const range = maxScore - minScore;

      if (range > 0) {
        for (const match of filtered) {
          match.score = (match.score - minScore) / range;
        }
      }
    }

    // Sort by score (descending)
    filtered.sort((a, b) => b.score - a.score);

    // Combine with remaining matches (beyond topK)
    const remaining = matches.slice(opts.topK);
    return [...filtered, ...remaining];
  }

  private async scoreCandidates(
    query: string,
    candidates: VectorSearchMatch[],
  ): Promise<VectorSearchMatch[]> {
    // Batch scoring for efficiency
    const batches: VectorSearchMatch[][] = [];
    for (let i = 0; i < candidates.length; i += this.options.batchSize) {
      batches.push(candidates.slice(i, i + this.options.batchSize));
    }

    const scored: VectorSearchMatch[] = [];

    for (const batch of batches) {
      const batchScores = await Promise.all(
        batch.map(match => this.scorePair(query, match)),
      );

      for (let i = 0; i < batch.length; i++) {
        scored.push({
          ...batch[i]!,
          score: batchScores[i]!,
        });
      }
    }

    return scored;
  }

  private async scorePair(
    query: string,
    match: VectorSearchMatch,
  ): Promise<number> {
    // Use LLM to score relevance
    const prompt = this.buildScoringPrompt(query, match.chunk.text);

    try {
      return await this.callLLMForScoring(prompt);
    } catch (error) {
      // Fallback to original score if LLM call fails
      getRerankLogger().warn('Re-ranking LLM call failed, using original score', { error });
      return match.score;
    }
  }

  private buildScoringPrompt(query: string, chunkText: string): string {
    // Truncate chunk text if too long (to save tokens)
    const maxChunkLength = 1000;
    const truncatedChunk = chunkText.length > maxChunkLength
      ? chunkText.slice(0, maxChunkLength) + '...'
      : chunkText;

    return `You are a code search relevance scorer. Rate how relevant the following code snippet is to the search query.

Query: "${query}"

Code snippet:
\`\`\`
${truncatedChunk}
\`\`\`

Respond with ONLY a number between 0.0 and 1.0 representing relevance (0.0 = not relevant, 1.0 = highly relevant).`;
  }

  private async callLLMForScoring(prompt: string): Promise<number> {
    const apiKey = this.options.apiKey ?? this.options.runtime.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OpenAI API key is required for re-ranking');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    const body = {
      model: this.options.model,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    };

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = typeof setTimeout !== 'undefined' ? setTimeout(() => controller?.abort(), this.options.timeout) : null;

    try {
      const response = await this.options.runtime.fetch(this.options.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller?.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Parse score from response
      const score = parseFloat(content);
      if (Number.isNaN(score) || score < 0 || score > 1) {
        throw new Error(`Invalid score format: ${content}`);
      }

      return score;
    } finally {
      if (timeoutId !== null && typeof clearTimeout !== 'undefined') {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * Simple heuristic re-ranking (fallback when LLM is not available)
 * Uses text similarity and metadata matching
 */
export class HeuristicReranker implements Reranker {
  async rerank(
    query: string,
    matches: VectorSearchMatch[],
    options: RerankingOptions = {},
  ): Promise<VectorSearchMatch[]> {
    const opts = {
      topK: options.topK ?? 20,
      minScore: options.minScore ?? 0,
      normalize: options.normalize ?? true,
    };

    const candidates = matches.slice(0, opts.topK);
    if (candidates.length === 0) {
      return matches;
    }

    // Score based on keyword matches and metadata
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);

    const scored = candidates.map(match => {
      let score = match.score;

      // Boost if query terms appear in chunk text
      const chunkLower = match.chunk.text.toLowerCase();
      const termMatches = queryTerms.filter(term => chunkLower.includes(term)).length;
      score += (termMatches / queryTerms.length) * 0.2;

      // Boost if query terms appear in path
      const pathLower = match.chunk.path.toLowerCase();
      const pathMatches = queryTerms.filter(term => pathLower.includes(term)).length;
      score += (pathMatches / queryTerms.length) * 0.1;

      return {
        ...match,
        score: Math.min(1, score), // Cap at 1.0
      };
    });

    // Filter and normalize
    const filtered = scored.filter(match => match.score >= opts.minScore);

    if (opts.normalize && filtered.length > 0) {
      const maxScore = Math.max(...filtered.map(m => m.score));
      const minScore = Math.min(...filtered.map(m => m.score));
      const range = maxScore - minScore;

      if (range > 0) {
        for (const match of filtered) {
          match.score = (match.score - minScore) / range;
        }
      }
    }

    filtered.sort((a, b) => b.score - a.score);
    const remaining = matches.slice(opts.topK);
    return [...filtered, ...remaining];
  }
}

