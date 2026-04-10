/**
 * @module @kb-labs/mind-embeddings/providers/openai
 * OpenAI Embedding Provider implementation
 */

import type { EmbeddingVector } from '../index';
import type { EmbeddingProvider } from '../index';
import type { EmbeddingRuntimeAdapter } from '../runtime-adapter-types';
import { getGlobalEmbeddingCache, type EmbeddingCacheOptions } from '../cache';

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
  dimension?: number;
  batchSize?: number;
  concurrency?: number;
  timeout?: number;
  retries?: number;
  baseURL?: string;
  cache?: EmbeddingCacheOptions;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Create OpenAI embedding provider using Runtime API
 */
export function createOpenAIEmbeddingProvider(
  options: OpenAIEmbeddingProviderOptions,
  runtime: EmbeddingRuntimeAdapter,
): EmbeddingProvider {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    dimension,
    batchSize = DEFAULT_BATCH_SIZE,
    concurrency = DEFAULT_CONCURRENCY,
    timeout = DEFAULT_TIMEOUT,
    retries = DEFAULT_RETRIES,
    baseURL = DEFAULT_BASE_URL,
    cache: cacheOptions,
  } = options;

  // Determine dimension based on model
  const embeddingDimension = dimension ?? getDefaultDimension(model);

  // Initialize cache
  const cache = getGlobalEmbeddingCache(cacheOptions);

  return {
    id: `openai-${model}`,
    async embed(texts: string[]): Promise<EmbeddingVector[]> {
      if (texts.length === 0) {
        return [];
      }

      // Track analytics if available
      const startTime = Date.now();
      runtime.analytics?.track('rag.embedding.start', {
        provider: 'openai',
        model,
        textsCount: texts.length,
      });

      try {
        // Check cache for existing embeddings
        const cachedResults = cache.getMany(texts, model);
        const textsToEmbed: string[] = [];
        const textIndexMap: Map<number, number> = new Map(); // original index -> new index

        for (let i = 0; i < texts.length; i++) {
          if (cachedResults[i] === null) {
            textIndexMap.set(i, textsToEmbed.length);
            const text = texts[i];
            if (text) {textsToEmbed.push(text);}
          }
        }

        const cacheHits = texts.length - textsToEmbed.length;
        const cacheMisses = textsToEmbed.length;

        // Track cache statistics
        if (cacheHits > 0 || cacheMisses > 0) {
          runtime.analytics?.track('rag.embedding.cache', {
            provider: 'openai',
            model,
            hits: cacheHits,
            misses: cacheMisses,
            hitRate: texts.length > 0 ? cacheHits / texts.length : 0,
            cacheStats: cache.getStats(),
          });
        }

        let newEmbeddings: EmbeddingVector[] = [];

        // Only make API calls if we have cache misses
        if (textsToEmbed.length > 0) {
          // Process in batches
          const batches: string[][] = [];
          for (let i = 0; i < textsToEmbed.length; i += batchSize) {
            batches.push(textsToEmbed.slice(i, i + batchSize));
          }

          // Process batches in parallel with concurrency limit
          newEmbeddings = await processBatchesInParallel(
            batches,
            concurrency,
            async (batch) => embedBatch(
              batch,
              apiKey,
              model,
              dimension,
              baseURL,
              timeout,
              retries,
              runtime,
            )
          );

          // Store new embeddings in cache
          const embeddingsToCache = newEmbeddings.map(emb => emb.values);
          cache.setMany(textsToEmbed, model, embeddingsToCache);
        }

        // Combine cached and new embeddings in original order
        const allEmbeddings: EmbeddingVector[] = [];
        let newEmbeddingIndex = 0;

        for (let i = 0; i < texts.length; i++) {
          const cached = cachedResults[i];
          if (cached !== null && cached !== undefined) {
            // Use cached embedding
            allEmbeddings.push({
              dim: cached.length,
              values: cached,
            });
          } else {
            // Use newly generated embedding
            const newEmb = newEmbeddings[newEmbeddingIndex];
            if (newEmb) {
              allEmbeddings.push(newEmb);
            }
            newEmbeddingIndex++;
          }
        }

        const duration = Date.now() - startTime;
        runtime.analytics?.track('rag.embedding.complete', {
          provider: 'openai',
          model,
          textsCount: texts.length,
          cacheHits,
          cacheMisses,
          duration,
          batches: textsToEmbed.length > 0 ? Math.ceil(textsToEmbed.length / batchSize) : 0,
        });

        return allEmbeddings;
      } catch (error) {
        const duration = Date.now() - startTime;
        runtime.analytics?.track('rag.embedding.error', {
          provider: 'openai',
          model,
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
        throw error;
      }
    },
  };
}

async function embedBatch(
  texts: string[],
  apiKey: string,
  model: string,
  dimension: number | undefined,
  baseURL: string,
  timeout: number,
  maxRetries: number,
  runtime: EmbeddingRuntimeAdapter,
): Promise<EmbeddingVector[]> {
  const url = `${baseURL}/embeddings`;
  const requestBody: Record<string, unknown> = {
    model,
    input: texts,
  };

  // Add dimension parameter for text-embedding-3 models
  if (dimension && (model.includes('3-small') || model.includes('3-large'))) {
    requestBody.dimensions = dimension;
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = typeof AbortController !== 'undefined' 
          ? new AbortController() 
          : null;
        const timeoutId = controller 
          ? setTimeout(() => controller.abort(), timeout) 
          : null;

      try {
        const response = await runtime.fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller?.signal,
        });

        if (timeoutId) {clearTimeout(timeoutId);}

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          let errorMessage = `OpenAI API error: ${response.status} ${response.statusText}`;
          
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            }
          } catch {
            // Use default error message
          }

          // Handle rate limiting
          if (response.status === 429) {
            const retryAfter = response.headers.get('retry-after');
            const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
            
            runtime.analytics?.track('rag.embedding.rate_limit', {
              provider: 'openai',
              retryAfter: waitTime,
              attempt: attempt + 1,
            });

            if (attempt < maxRetries) {
              await sleep(waitTime);
              continue;
            }
          }

          throw new Error(errorMessage);
        }

        const data = (await response.json()) as OpenAIEmbeddingResponse;
        
        // Track cost
        if (runtime.analytics && data.usage) {
          const cost = calculateCost(data.usage.total_tokens, model);
          runtime.analytics.track('rag.cost', {
            provider: 'openai',
            operation: 'embedding',
            tokens: data.usage.total_tokens,
            cost,
            model,
          });
        }

        // Sort by index and convert to EmbeddingVector format
        const sortedData = [...data.data].sort((a, b) => a.index - b.index);
        return sortedData.map(item => ({
          dim: item.embedding.length,
          values: item.embedding,
        }));
      } catch (error) {
        if (timeoutId) {clearTimeout(timeoutId);}
        
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`OpenAI API request timeout after ${timeout}ms`);
        }
        
        throw error;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on client errors (4xx) except 429
      if (lastError.message.includes('API error: 4') && !lastError.message.includes('429')) {
        throw lastError;
      }

      // Exponential backoff for retries
      if (attempt < maxRetries) {
        const backoffTime = Math.pow(2, attempt) * 1000;
        await sleep(backoffTime);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Failed to generate embeddings after retries');
}

function getDefaultDimension(model: string): number {
  if (model.includes('3-large')) {
    return 3072;
  }
  if (model.includes('3-small')) {
    return 1536;
  }
  if (model.includes('ada-002')) {
    return 1536;
  }
  return 1536; // Default fallback
}

function calculateCost(tokens: number, model: string): number {
  // Pricing as of 2024 (per 1M tokens)
  const prices: Record<string, number> = {
    'text-embedding-3-small': 0.02,
    'text-embedding-3-large': 0.13,
    'text-embedding-ada-002': 0.10,
  };

  const pricePer1M = prices[model] ?? prices['text-embedding-3-small'] ?? 0.02;
  return (tokens / 1_000_000) * pricePer1M;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    if (typeof setTimeout !== 'undefined') {
      setTimeout(resolve, ms);
    } else {
      // Fallback for environments without setTimeout
      resolve();
    }
  });
}

/**
 * Process batches in parallel with concurrency limit
 * Similar to p-map but without external dependency
 */
async function processBatchesInParallel<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<R[]>
): Promise<R[]> {
  const results: R[][] = new Array(items.length);
  const executing: Set<Promise<void>> = new Set();

  for (let i = 0; i < items.length; i++) {
    const index = i;
    const item = items[index];
    if (!item) {continue;}

    const promise = (async () => {
      results[index] = await processor(item);
    })();

    executing.add(promise);
    promise.finally(() => executing.delete(promise));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results.flat();
}

