import { createHash } from 'node:crypto';
export interface EmbeddingVector {
  dim: number;
  values: number[];
}

import type { EmbeddingRuntimeAdapter } from './runtime-adapter-types';
import { createOpenAIEmbeddingProvider } from './providers/openai';
import { createLocalEmbeddingProvider } from './providers/local';

const DEFAULT_DIMENSION = 384;

export interface EmbeddingProvider {
  readonly id: string;
  embed(texts: string[]): Promise<EmbeddingVector[]>;
}

export interface EmbeddingProviderConfig {
  type?: 'auto' | 'openai' | 'local' | 'deterministic';
  provider?: {
    openai?: {
      apiKey?: string;
      model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
      dimension?: number;
      batchSize?: number;
      concurrency?: number;
      timeout?: number;
      retries?: number;
      baseURL?: string;
      cache?: {
        enabled?: boolean;
        maxSize?: number;
        ttlMs?: number;
      };
    };
    local?: {
      type?: 'ollama' | 'in-process';
      model?: string;
      endpoint?: string;
      dimension?: number;
    };
    deterministic?: {
      dimension?: number;
    };
  };
}

export interface DeterministicEmbeddingProviderOptions {
  dimension?: number;
}

/**
 * Deterministic embedding provider used for local development and tests.
 * Produces pseudo-random vectors that are stable between runs.
 */
export function createDeterministicEmbeddingProvider(
  options: DeterministicEmbeddingProviderOptions = {},
): EmbeddingProvider {
  const dim = options.dimension ?? DEFAULT_DIMENSION;

  return {
    id: 'mind-embedding-deterministic',
    async embed(texts: string[]) {
      return texts.map(text => createDeterministicVector(text, dim));
    },
  };
}

function createDeterministicVector(text: string, dim: number): EmbeddingVector {
  const hash = createHash('sha256').update(text).digest();
  const values: number[] = [];

  let seed = hash.readUInt32BE(0);
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;

  for (let i = 0; i < dim; i++) {
    seed = (a * seed + c) % m;
    const value = (seed / m) * 2 - 1; // map to [-1, 1]
    values.push(value);
  }

  return normalizeVector({ dim, values });
}

export function normalizeVector(vector: EmbeddingVector): EmbeddingVector {
  const norm = Math.sqrt(
    vector.values.reduce((acc: number, value: number) => acc + value * value, 0),
  );
  if (norm === 0) {
    return vector;
  }
  return {
    dim: vector.dim,
    values: vector.values.map((value: number) => value / norm),
  };
}

export function dotProduct(
  a: EmbeddingVector,
  b: EmbeddingVector,
): number {
  if (a.dim !== b.dim) {
    throw new Error(
      `Cannot compute dot product for different dimensions (${a.dim} vs ${b.dim}).`,
    );
  }

  let sum = 0;
  for (let i = 0; i < a.dim; i++) {
    sum += a.values[i]! * b.values[i]!;
  }
  return sum;
}

/**
 * Create embedding provider with automatic selection based on availability
 */
export function createEmbeddingProvider(
  config: EmbeddingProviderConfig,
  runtime: EmbeddingRuntimeAdapter,
): EmbeddingProvider {
  const type = config.type ?? 'auto';

  // Auto mode: try OpenAI first, fallback to local, then deterministic
  if (type === 'auto') {
    const openaiKey = runtime.env.get('OPENAI_API_KEY') ?? config.provider?.openai?.apiKey;
    
    if (openaiKey) {
      return createOpenAIEmbeddingProvider(
        {
          apiKey: openaiKey,
          model: config.provider?.openai?.model,
          dimension: config.provider?.openai?.dimension,
          batchSize: config.provider?.openai?.batchSize,
          concurrency: config.provider?.openai?.concurrency,
          timeout: config.provider?.openai?.timeout,
          retries: config.provider?.openai?.retries,
          baseURL: config.provider?.openai?.baseURL,
          cache: config.provider?.openai?.cache,
        },
        runtime,
      );
    }

    // Try local provider (Ollama)
    const localConfig = config.provider?.local;
    if (localConfig) {
      return createLocalEmbeddingProvider(
        {
          type: localConfig.type ?? 'ollama',
          model: localConfig.model,
          endpoint: localConfig.endpoint,
          dimension: localConfig.dimension,
        },
        runtime,
      );
    }

    // Fallback to deterministic
    return createDeterministicEmbeddingProvider({
      dimension: config.provider?.deterministic?.dimension,
    });
  }

  // Explicit type selection
  switch (type) {
    case 'openai': {
      const apiKey = runtime.env.get('OPENAI_API_KEY') ?? config.provider?.openai?.apiKey;
      if (!apiKey) {
        throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide in config.');
      }
      return createOpenAIEmbeddingProvider(
        {
          apiKey,
          model: config.provider?.openai?.model,
          dimension: config.provider?.openai?.dimension,
          batchSize: config.provider?.openai?.batchSize,
          concurrency: config.provider?.openai?.concurrency,
          timeout: config.provider?.openai?.timeout,
          retries: config.provider?.openai?.retries,
          baseURL: config.provider?.openai?.baseURL,
          cache: config.provider?.openai?.cache,
        },
        runtime,
      );
    }

    case 'local': {
      const localConfig = config.provider?.local;
      if (!localConfig) {
        throw new Error('Local provider configuration is required.');
      }
      return createLocalEmbeddingProvider(
        {
          type: localConfig.type ?? 'ollama',
          model: localConfig.model,
          endpoint: localConfig.endpoint,
          dimension: localConfig.dimension,
        },
        runtime,
      );
    }

    case 'deterministic':
      return createDeterministicEmbeddingProvider({
        dimension: config.provider?.deterministic?.dimension,
      });

    default:
      throw new Error(`Unknown embedding provider type: ${type}`);
  }
}

// Export provider types
export type { OpenAIEmbeddingProviderOptions } from './providers/openai';
export type { LocalEmbeddingProviderOptions } from './providers/local';
export { createOpenAIEmbeddingProvider } from './providers/openai';
export { createLocalEmbeddingProvider } from './providers/local';
export type { EmbeddingRuntimeAdapter } from './runtime-adapter-types';

// Export cache types and utilities
export type { EmbeddingCacheEntry, EmbeddingCacheOptions } from './cache';
export { EmbeddingCache, getGlobalEmbeddingCache, resetGlobalEmbeddingCache } from './cache';
