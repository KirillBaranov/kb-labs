/**
 * @module @kb-labs/mind-engine/reranking
 * Re-ranking system for improving search result relevance
 */

export type {
  Reranker,
  RerankingOptions,
  CrossEncoderRerankerOptions,
} from './reranker';

export { CrossEncoderReranker, HeuristicReranker } from './reranker';

// Smart heuristic reranker (improved version)
export {
  SmartHeuristicReranker,
  createSmartHeuristicReranker,
  type SmartHeuristicRerankerOptions,
  type HeuristicScoreBreakdown,
} from './smart-heuristic-reranker';

import type { RuntimeAdapter } from '../adapters/runtime-adapter';
import { CrossEncoderReranker } from './reranker';
import { HeuristicReranker } from './reranker';
import { SmartHeuristicReranker } from './smart-heuristic-reranker';
import type { Reranker } from './reranker';

export type RerankerType = 'cross-encoder' | 'heuristic' | 'smart-heuristic' | 'none';

export interface RerankerConfig {
  type?: RerankerType;
  crossEncoder?: {
    endpoint?: string;
    apiKey?: string;
    model?: string;
    batchSize?: number;
    timeout?: number;
  };
  smartHeuristic?: {
    exactMatchWeight?: number;
    symbolMatchWeight?: number;
    definitionWeight?: number;
    pathRelevanceWeight?: number;
    termDensityWeight?: number;
    positionWeight?: number;
  };
}

/**
 * Create a reranker instance based on configuration
 */
export function createReranker(
  config: RerankerConfig,
  runtime: RuntimeAdapter,
): Reranker | null {
  const type = config.type ?? 'none';

  if (type === 'none') {
    return null;
  }

  if (type === 'heuristic') {
    return new HeuristicReranker();
  }

  if (type === 'smart-heuristic') {
    return new SmartHeuristicReranker(config.smartHeuristic);
  }

  if (type === 'cross-encoder') {
    return new CrossEncoderReranker({
      endpoint: config.crossEncoder?.endpoint,
      apiKey: config.crossEncoder?.apiKey,
      model: config.crossEncoder?.model,
      batchSize: config.crossEncoder?.batchSize,
      timeout: config.crossEncoder?.timeout,
      runtime,
    });
  }

  throw new Error(`Unknown reranker type: ${type}`);
}






