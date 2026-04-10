/**
 * @module @kb-labs/mind-embeddings/providers/local
 * Local Embedding Provider implementations (Ollama, in-process)
 */

import type { EmbeddingVector } from '../index';
import type { EmbeddingProvider } from '../index';
import type { EmbeddingRuntimeAdapter } from '../runtime-adapter-types';

export interface LocalEmbeddingProviderOptions {
  type: 'ollama' | 'in-process';
  model?: string;
  endpoint?: string;
  dimension?: number;
}

const DEFAULT_OLLAMA_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'nomic-embed';
const DEFAULT_DIMENSION = 768;

/**
 * Create local embedding provider (Ollama or in-process)
 */
export function createLocalEmbeddingProvider(
  options: LocalEmbeddingProviderOptions,
  runtime: EmbeddingRuntimeAdapter,
): EmbeddingProvider {
  const {
    type,
    model = DEFAULT_MODEL,
    endpoint = DEFAULT_OLLAMA_ENDPOINT,
    dimension = DEFAULT_DIMENSION,
  } = options;

  if (type === 'ollama') {
    return createOllamaProvider(model, endpoint, dimension, runtime);
  }

  // In-process provider (future: could use onnxruntime or similar)
  throw new Error('In-process embedding provider not yet implemented. Use Ollama or OpenAI.');
}

function createOllamaProvider(
  model: string,
  endpoint: string,
  dimension: number,
  runtime: EmbeddingRuntimeAdapter,
): EmbeddingProvider {
  return {
    id: `ollama-${model}`,
    async embed(texts: string[]): Promise<EmbeddingVector[]> {
      if (texts.length === 0) {
        return [];
      }

      const startTime = Date.now();
      runtime.analytics?.track('rag.embedding.start', {
        provider: 'ollama',
        model,
        textsCount: texts.length,
      });

      try {
        const url = `${endpoint}/api/embeddings`;
        const embeddings: EmbeddingVector[] = [];

        // Ollama processes one text at a time
        for (const text of texts) {
          const response = await runtime.fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              prompt: text,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Ollama API error: ${response.status} ${errorText}`);
          }

          const data = (await response.json()) as { embedding: number[] };
          embeddings.push({
            dim: data.embedding.length,
            values: data.embedding,
          });
        }

        const duration = Date.now() - startTime;
        runtime.analytics?.track('rag.embedding.complete', {
          provider: 'ollama',
          model,
          textsCount: texts.length,
          duration,
        });

        return embeddings;
      } catch (error) {
        const duration = Date.now() - startTime;
        runtime.analytics?.track('rag.embedding.error', {
          provider: 'ollama',
          model,
          error: error instanceof Error ? error.message : String(error),
          duration,
        });
        throw error;
      }
    },
  };
}

