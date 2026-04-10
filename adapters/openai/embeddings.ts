/**
 * @module @kb-labs/adapters-openai/embeddings
 * OpenAI embeddings adapter entry point.
 *
 * This file provides a separate entry point for the embeddings adapter,
 * allowing it to be loaded independently from the LLM adapter.
 *
 * @example
 * ```json
 * // In kb.config.json
 * {
 *   "platform": {
 *     "adapters": {
 *       "embeddings": "@kb-labs/adapters-openai/embeddings"
 *     }
 *   }
 * }
 * ```
 */

import { OpenAIEmbeddings, type OpenAIEmbeddingsConfig } from './src/embeddings.js';

// Re-export manifest
export { manifest } from './src/embeddings-manifest.js';

// Re-export types and class
export { OpenAIEmbeddings, type OpenAIEmbeddingsConfig, EMBEDDING_MODELS, type EmbeddingModel } from './src/embeddings.js';

/**
 * Create OpenAI embeddings adapter.
 */
export function createAdapter(config?: OpenAIEmbeddingsConfig): OpenAIEmbeddings {
  return new OpenAIEmbeddings(config);
}

// Default export
export default createAdapter;
