/**
 * @module @kb-labs/mind-engine/learning/query-history
 * Query history storage and retrieval
 */

import { createHash } from 'node:crypto';
import { cosineSimilarity } from '@kb-labs/mind-core';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';

export interface QueryHistoryEntry {
  queryId: string;
  queryText: string;
  queryHash: string;
  scopeId: string;
  timestamp: number;
  resultChunkIds: string[];
  topChunkIds: string[]; // Top 10 chunks returned
  queryVector?: number[]; // Optional: store query embedding for pattern matching
  reasoningPlan?: ReasoningPlanMetadata; // Optional: reasoning plan metadata
}

export interface ReasoningPlanMetadata {
  queryHash: string;
  scopeId: string;
  plan: {
    originalQuery: string;
    subqueries: Array<{
      text: string;
      priority: number;
      groupId: number;
      relevance: number;
    }>;
    complexityScore: number;
  };
  complexityScore: number;
  subqueriesCount: number;
  parallelExecuted: number;
  timing: {
    planningTimeMs: number;
    executionTimeMs: number;
    synthesisTimeMs: number;
    totalTimeMs: number;
  };
}

export interface QueryHistoryStore {
  save(entry: QueryHistoryEntry): Promise<void>;
  findByQuery(queryText: string, scopeId: string): Promise<QueryHistoryEntry[]>;
  findBySimilarQuery(queryVector: number[], scopeId: string, limit?: number): Promise<QueryHistoryEntry[]>;
  getPopularQueries(scopeId: string, limit?: number): Promise<Array<{ query: string; count: number }>>;
  saveReasoningPlan(metadata: ReasoningPlanMetadata): Promise<void>;
}

/**
 * In-memory query history store (can be replaced with persistent storage)
 */
export class MemoryQueryHistoryStore implements QueryHistoryStore {
  private readonly entries: QueryHistoryEntry[] = [];
  private readonly maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  async save(entry: QueryHistoryEntry): Promise<void> {
    this.entries.push(entry);
    
    // Keep only recent entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  async findByQuery(queryText: string, scopeId: string): Promise<QueryHistoryEntry[]> {
    const queryHash = createHash('sha256').update(queryText.toLowerCase().trim()).digest('hex');
    return this.entries.filter(
      entry => entry.queryHash === queryHash && entry.scopeId === scopeId
    );
  }

  async findBySimilarQuery(
    queryVector: number[],
    scopeId: string,
    limit: number = 10,
  ): Promise<QueryHistoryEntry[]> {
    // Simple cosine similarity (can be optimized)
    return this.entries
      .filter(entry => entry.scopeId === scopeId && entry.queryVector)
      .map(entry => {
        const similarity = cosineSimilarity(queryVector, entry.queryVector!);
        return { entry, similarity };
      })
      .filter(item => item.similarity > 0.7) // Threshold for similarity
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.entry);
  }

  async getPopularQueries(
    scopeId: string,
    limit: number = 20,
  ): Promise<Array<{ query: string; count: number }>> {
    const queryCounts = new Map<string, number>();
    
    for (const entry of this.entries) {
      if (entry.scopeId === scopeId) {
        const count = queryCounts.get(entry.queryText) ?? 0;
        queryCounts.set(entry.queryText, count + 1);
      }
    }

    return Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async saveReasoningPlan(metadata: ReasoningPlanMetadata): Promise<void> {
    // Find existing entry by queryHash and scopeId
    const existingEntries = this.entries.filter(
      entry => entry.queryHash === metadata.queryHash && entry.scopeId === metadata.scopeId
    );
    
    if (existingEntries.length > 0) {
      // Update existing entry with reasoning plan
      for (const entry of existingEntries) {
        entry.reasoningPlan = metadata;
      }
    } else {
      // Create new entry with reasoning plan
      const entry: QueryHistoryEntry = {
        queryId: createHash('sha256')
          .update(`${metadata.scopeId}:${metadata.queryHash}:${Date.now()}`)
          .digest('hex')
          .substring(0, 16),
        queryText: metadata.plan.originalQuery,
        queryHash: metadata.queryHash,
        scopeId: metadata.scopeId,
        timestamp: Date.now(),
        resultChunkIds: [],
        topChunkIds: [],
        reasoningPlan: metadata,
      };
      await this.save(entry);
    }
  }

}

/**
 * Qdrant-based query history store (persistent)
 */
export class QdrantQueryHistoryStore implements QueryHistoryStore {
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
      collectionName: options.collectionName ?? 'mind_query_history',
      runtime: options.runtime,
    };
  }

  async save(entry: QueryHistoryEntry): Promise<void> {
    await this.ensureCollection();
    
    // Generate UUID-like ID for Qdrant (32 hex chars = 16 bytes)
    const hash = createHash('sha256')
      .update(`${entry.scopeId}:${entry.queryHash}:${entry.timestamp}`)
      .digest('hex');
    
    // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const pointId = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;

    // Ensure vector has correct dimension (1536 for OpenAI embeddings)
    // Qdrant requires vector to match collection dimension exactly
    let vector: number[];
    if (entry.queryVector && entry.queryVector.length === 1536) {
      vector = entry.queryVector;
    } else if (entry.queryVector && entry.queryVector.length > 0) {
      // Pad or truncate to 1536
      vector = entry.queryVector.slice(0, 1536);
      while (vector.length < 1536) {
        vector.push(0);
      }
    } else {
      // Fallback: zero vector of correct dimension
      vector = new Array(1536).fill(0);
    }

    const point = {
      id: pointId,
      vector: vector,
      payload: {
        queryId: entry.queryId,
        queryText: entry.queryText,
        queryHash: entry.queryHash,
        scopeId: entry.scopeId,
        timestamp: entry.timestamp,
        resultChunkIds: entry.resultChunkIds,
        topChunkIds: entry.topChunkIds,
        reasoningPlan: entry.reasoningPlan,
      },
    };

    const url = `${this.options.url}/collections/${this.options.collectionName}/points?wait=true`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.options.apiKey) {
      headers['api-key'] = this.options.apiKey;
    }

    const requestBody = JSON.stringify({ points: [point] });
    
    if (this.options.runtime.log) {
      this.options.runtime.log('debug', 'Saving query history point', {
        url,
        pointId,
        vectorLength: vector.length,
        payloadKeys: Object.keys(point.payload),
      });
    }

    const response = await this.options.runtime.fetch(url, {
      method: 'PUT',
      headers,
      body: requestBody,
    });

    const responseText = await response.text();

    if (!response.ok) {
      const error = new Error(`Failed to save query history: ${response.status} ${responseText}`);
      // Log error if runtime has log function
      if (this.options.runtime.log) {
        this.options.runtime.log('error', 'Failed to save query history', {
          status: response.status,
          errorText: responseText.substring(0, 500),
          queryId: entry.queryId,
          url,
        });
      }
      throw error;
    }

    if (this.options.runtime.log) {
      this.options.runtime.log('debug', 'Query history point saved', {
        pointId,
        queryId: entry.queryId,
        responseStatus: response.status,
      });
    }
  }

  async findByQuery(queryText: string, scopeId: string): Promise<QueryHistoryEntry[]> {
    const queryHash = createHash('sha256').update(queryText.toLowerCase().trim()).digest('hex');
    
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
            { key: 'queryHash', match: { value: queryHash } },
          ],
        },
        limit: 100,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as { result: { points: Array<{ payload: Record<string, unknown> }> } };
    return data.result.points.map(point => ({
      queryId: point.payload.queryId as string,
      queryText: point.payload.queryText as string,
      queryHash: point.payload.queryHash as string,
      scopeId: point.payload.scopeId as string,
      timestamp: point.payload.timestamp as number,
      resultChunkIds: point.payload.resultChunkIds as string[],
      topChunkIds: point.payload.topChunkIds as string[],
    }));
  }

  async findBySimilarQuery(
    queryVector: number[],
    scopeId: string,
    limit: number = 10,
  ): Promise<QueryHistoryEntry[]> {
    await this.ensureCollection();

    const url = `${this.options.url}/collections/${this.options.collectionName}/points/search`;
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
        vector: queryVector,
        limit,
        filter: {
          must: [
            { key: 'scopeId', match: { value: scopeId } },
          ],
        },
        with_payload: true,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as {
      result: Array<{
        payload: Record<string, unknown>;
        score: number;
      }>;
    };

    return data.result
      .filter(item => item.score > 0.7) // Similarity threshold
      .map(item => ({
        queryId: item.payload.queryId as string,
        queryText: item.payload.queryText as string,
        queryHash: item.payload.queryHash as string,
        scopeId: item.payload.scopeId as string,
        timestamp: item.payload.timestamp as number,
        resultChunkIds: item.payload.resultChunkIds as string[],
        topChunkIds: item.payload.topChunkIds as string[],
      }));
  }

  async getPopularQueries(
    scopeId: string,
    limit: number = 20,
  ): Promise<Array<{ query: string; count: number }>> {
    // Scroll all entries for scope and count
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
          ],
        },
        limit: 10000,
        with_payload: true,
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as {
      result: { points: Array<{ payload: Record<string, unknown> }> };
    };

    const queryCounts = new Map<string, number>();
    for (const point of data.result.points) {
      const query = point.payload.queryText as string;
      const count = queryCounts.get(query) ?? 0;
      queryCounts.set(query, count + 1);
    }

    return Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async saveReasoningPlan(metadata: ReasoningPlanMetadata): Promise<void> {
    // Find existing entry by queryHash and scopeId
    const existingEntries = await this.findByQuery(
      metadata.plan.originalQuery,
      metadata.scopeId
    );
    
    if (existingEntries.length > 0) {
      // Update existing entry with reasoning plan
      const entry = existingEntries[0]!;
      entry.reasoningPlan = metadata;
      await this.save(entry);
    } else {
      // Create new entry with reasoning plan
      const queryHash = createHash('sha256')
        .update(metadata.plan.originalQuery.toLowerCase().trim())
        .digest('hex');
      
      const entry: QueryHistoryEntry = {
        queryId: createHash('sha256')
          .update(`${metadata.scopeId}:${queryHash}:${Date.now()}`)
          .digest('hex')
          .substring(0, 16),
        queryText: metadata.plan.originalQuery,
        queryHash,
        scopeId: metadata.scopeId,
        timestamp: Date.now(),
        resultChunkIds: [],
        topChunkIds: [],
        reasoningPlan: metadata,
      };
      await this.save(entry);
    }
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
      return; // Collection exists
    }

    // Create collection (dimension 1536 for OpenAI embeddings, can be configurable)
    const createUrl = `${this.options.url}/collections/${this.options.collectionName}`;
    const createResponse = await this.options.runtime.fetch(createUrl, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
      }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create query history collection: ${createResponse.status} ${errorText}`);
    }
  }
}

