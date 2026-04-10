/**
 * @module @kb-labs/mind-engine/learning/feedback
 * Feedback collection system (implicit + explicit + self-feedback)
 */

import { createHash } from 'node:crypto';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';

export type FeedbackType = 'explicit' | 'implicit' | 'self';

export interface FeedbackEntry {
  feedbackId: string;
  queryId: string;
  chunkId: string;
  scopeId: string;
  type: FeedbackType;
  score: number; // 0-1: relevance score
  timestamp: number;
  metadata?: {
    // For implicit feedback
    usedInResponse?: boolean;
    positionInResults?: number;
    timeSpent?: number; // milliseconds
    
    // For explicit feedback
    userRating?: number; // 1-5 stars
    
    // For self-feedback (LLM-based)
    llmReasoning?: string;
    confidence?: number;
  };
}

export interface FeedbackStore {
  save(feedback: FeedbackEntry): Promise<void>;
  getChunkFeedback(chunkId: string, scopeId: string): Promise<FeedbackEntry[]>;
  getAverageScore(chunkId: string, scopeId: string): Promise<number>;
  getChunkUsageCount(chunkId: string, scopeId: string): Promise<number>;
}

/**
 * In-memory feedback store
 */
export class MemoryFeedbackStore implements FeedbackStore {
  private readonly entries: FeedbackEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 50000) {
    this.maxEntries = maxEntries;
  }

  async save(feedback: FeedbackEntry): Promise<void> {
    this.entries.push(feedback);
    
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  async getChunkFeedback(chunkId: string, scopeId: string): Promise<FeedbackEntry[]> {
    return this.entries.filter(
      entry => entry.chunkId === chunkId && entry.scopeId === scopeId
    );
  }

  async getAverageScore(chunkId: string, scopeId: string): Promise<number> {
    const feedbacks = await this.getChunkFeedback(chunkId, scopeId);
    if (feedbacks.length === 0) {return 0.5;} // Default neutral score
    
    const sum = feedbacks.reduce((acc, f) => acc + f.score, 0);
    return sum / feedbacks.length;
  }

  async getChunkUsageCount(chunkId: string, scopeId: string): Promise<number> {
    return this.entries.filter(
      entry => entry.chunkId === chunkId && 
               entry.scopeId === scopeId &&
               (entry.type === 'implicit' || entry.type === 'explicit')
    ).length;
  }
}

/**
 * Qdrant-based feedback store (persistent)
 */
export class QdrantFeedbackStore implements FeedbackStore {
  private readonly options: {
    url: string;
    apiKey?: string;
    collectionName: string;
    runtime: RuntimeAdapter;
  };

  constructor(options: {
    url: string;
    apiKey?: string;
    collectionName?: string;
    runtime: RuntimeAdapter;
  }) {
    this.options = {
      url: options.url,
      apiKey: options.apiKey,
      collectionName: options.collectionName ?? 'mind_feedback',
      runtime: options.runtime,
    };
  }

  async save(feedback: FeedbackEntry): Promise<void> {
    await this.ensureCollection();
    
    const pointId = createHash('sha256')
      .update(`${feedback.scopeId}:${feedback.chunkId}:${feedback.queryId}:${feedback.timestamp}`)
      .digest('hex')
      .substring(0, 16);

    const point = {
      id: pointId,
      vector: [], // No vector needed for feedback
      payload: {
        feedbackId: feedback.feedbackId,
        queryId: feedback.queryId,
        chunkId: feedback.chunkId,
        scopeId: feedback.scopeId,
        type: feedback.type,
        score: feedback.score,
        timestamp: feedback.timestamp,
        metadata: feedback.metadata ?? {},
      },
    };

    const url = `${this.options.url}/collections/${this.options.collectionName}/points?wait=true`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.apiKey) {
      headers['api-key'] = this.options.apiKey;
    }

    const response = await this.options.runtime.fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ points: [point] }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save feedback: ${response.status} ${errorText}`);
    }
  }

  async getChunkFeedback(chunkId: string, scopeId: string): Promise<FeedbackEntry[]> {
    const url = `${this.options.url}/collections/${this.options.collectionName}/points/scroll`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.apiKey) {
      headers['api-key'] = this.options.apiKey;
    }

    const response = await this.options.runtime.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'scopeId', match: { value: scopeId } },
            { key: 'chunkId', match: { value: chunkId } },
          ],
        },
        limit: 1000,
        with_payload: true,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as {
      result: { points: Array<{ payload: Record<string, unknown> & { feedbackId: string } }> };
    };

    return data.result.points.map(point => ({
      feedbackId: point.payload.feedbackId,
      queryId: point.payload.queryId as string,
      chunkId: point.payload.chunkId as string,
      scopeId: point.payload.scopeId as string,
      type: point.payload.type as FeedbackType,
      score: point.payload.score as number,
      timestamp: point.payload.timestamp as number,
      metadata: point.payload.metadata as FeedbackEntry['metadata'],
    }));
  }

  async getAverageScore(chunkId: string, scopeId: string): Promise<number> {
    const feedbacks = await this.getChunkFeedback(chunkId, scopeId);
    if (feedbacks.length === 0) {return 0.5;}
    
    const sum = feedbacks.reduce((acc, f) => acc + f.score, 0);
    return sum / feedbacks.length;
  }

  async getChunkUsageCount(chunkId: string, scopeId: string): Promise<number> {
    const url = `${this.options.url}/collections/${this.options.collectionName}/points/scroll`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.apiKey) {
      headers['api-key'] = this.options.apiKey;
    }

    const response = await this.options.runtime.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'scopeId', match: { value: scopeId } },
            { key: 'chunkId', match: { value: chunkId } },
            {
              key: 'type',
              match: { value: ['implicit', 'explicit'] },
            },
          ],
        },
        limit: 10000,
        with_payload: false, // We only need count
      }),
    });

    if (!response.ok) {
      return 0;
    }

    const data = await response.json() as { result: { points: unknown[] } };
    return data.result.points.length;
  }

  private async ensureCollection(): Promise<void> {
    const url = `${this.options.url}/collections/${this.options.collectionName}`;
    const headers: Record<string, string> = {};

    if (this.options.apiKey) {
      headers['api-key'] = this.options.apiKey;
    }

    const checkResponse = await this.options.runtime.fetch(url, {
      method: 'GET',
      headers,
    });

    if (checkResponse.ok) {
      return;
    }

    // Create collection (no vectors needed, just payload)
    const createUrl = `${this.options.url}/collections/${this.options.collectionName}`;
    const createResponse = await this.options.runtime.fetch(createUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vectors: {
          size: 1, // Minimal vector size (not used)
          distance: 'Cosine',
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create feedback collection: ${createResponse.status} ${errorText}`);
    }
  }
}

/**
 * Self-feedback generator using LLM
 * Agent can use this to evaluate chunk relevance
 */
export class SelfFeedbackGenerator {
  private readonly runtime: RuntimeAdapter;
  private readonly apiKey?: string;

  constructor(runtime: RuntimeAdapter, apiKey?: string) {
    this.runtime = runtime;
    this.apiKey = apiKey ?? runtime.env.get('OPENAI_API_KEY');
  }

  async generateFeedback(
    query: string,
    chunkText: string,
    chunkPath: string,
  ): Promise<{ score: number; reasoning: string; confidence: number }> {
    if (!this.apiKey) {
      // Fallback: simple heuristic if no API key
      return this.heuristicScore(query, chunkText, chunkPath);
    }

    const prompt = this.buildFeedbackPrompt(query, chunkText, chunkPath);

    try {
      const response = await this.runtime.fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a code search relevance evaluator. Rate how relevant a code snippet is to a search query.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        return this.heuristicScore(query, chunkText, chunkPath);
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
        return this.heuristicScore(query, chunkText, chunkPath);
      }

      // Parse JSON response: { score: 0.8, reasoning: "...", confidence: 0.9 }
      const parsed = JSON.parse(content) as {
        score?: number;
        reasoning?: string;
        confidence?: number;
      };

      return {
        score: Math.max(0, Math.min(1, parsed.score ?? 0.5)),
        reasoning: parsed.reasoning ?? '',
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.7)),
      };
    } catch (error) {
      // Fallback to heuristic
      return this.heuristicScore(query, chunkText, chunkPath);
    }
  }

  private buildFeedbackPrompt(query: string, chunkText: string, chunkPath: string): string {
    const truncatedChunk = chunkText.length > 1000
      ? chunkText.slice(0, 1000) + '...'
      : chunkText;

    return `Evaluate the relevance of this code snippet to the search query.

Query: "${query}"
File: ${chunkPath}

Code snippet:
\`\`\`
${truncatedChunk}
\`\`\`

Respond with JSON:
{
  "score": 0.0-1.0,  // Relevance score (0 = not relevant, 1 = highly relevant)
  "reasoning": "Brief explanation",
  "confidence": 0.0-1.0  // How confident you are in this score
}`;
  }

  private heuristicScore(query: string, chunkText: string, chunkPath: string): {
    score: number;
    reasoning: string;
    confidence: number;
  } {
    const queryLower = query.toLowerCase();
    const chunkLower = chunkText.toLowerCase();
    const pathLower = chunkPath.toLowerCase();

    // Simple keyword matching
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    const textMatches = queryTerms.filter(term => chunkLower.includes(term)).length;
    const pathMatches = queryTerms.filter(term => pathLower.includes(term)).length;

    const textScore = queryTerms.length > 0 ? textMatches / queryTerms.length : 0;
    const pathScore = queryTerms.length > 0 ? pathMatches / queryTerms.length : 0;

    const score = Math.min(1, textScore * 0.7 + pathScore * 0.3);
    
    return {
      score,
      reasoning: `Heuristic: ${textMatches}/${queryTerms.length} text matches, ${pathMatches}/${queryTerms.length} path matches`,
      confidence: 0.5, // Lower confidence for heuristic
    };
  }
}

