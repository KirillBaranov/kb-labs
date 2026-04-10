import type { EmbeddingVector } from './engine-contracts';

export interface EmbeddingProvider {
  id?: string;
  embed(texts: string[]): Promise<EmbeddingVector[]>;
}

export interface EmbeddingProviderConfig {
  type?: 'deterministic' | 'openai' | 'local' | string;
  provider?: Record<string, any>;
  model?: string;
  dimensions?: number;
  [key: string]: unknown;
}
