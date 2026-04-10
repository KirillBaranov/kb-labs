import type { MindIndexStats } from '@kb-labs/mind-types';

export interface SpanRange {
  startLine: number;
  endLine: number;
}

export interface EmbeddingVector {
  dim: number;
  values: number[];
}

export interface KnowledgeChunk {
  id: string;
  chunkId?: string;
  sourceId: string;
  path: string;
  span: SpanRange;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeSource {
  id: string;
  paths: string[];
  exclude?: string[];
  kind?: string;
  language?: string;
  [key: string]: unknown;
}

export interface KnowledgeQuery {
  text: string;
  intent: 'summary' | 'search' | 'similar' | 'nav' | string;
  limit?: number;
  profileId?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KnowledgeResult {
  query: {
    text: string;
    intent: 'summary' | 'search' | 'similar' | 'nav' | string;
    [key: string]: unknown;
  };
  chunks: KnowledgeChunk[];
  contextText: string;
  metadata?: Record<string, unknown>;
  engineId?: string;
  generatedAt?: string;
  [key: string]: unknown;
}

export interface KnowledgeEngineConfig {
  id: string;
  type: string;
  options?: Record<string, unknown>;
}

export interface KnowledgeEngineFactoryContext {
  workspaceRoot?: string;
}

export type KnowledgeEngineFactory = (
  config: KnowledgeEngineConfig,
  context: KnowledgeEngineFactoryContext,
) => KnowledgeEngine;

export interface KnowledgeEngineRegistry {
  register(type: string, factory: KnowledgeEngineFactory): void;
}

export interface KnowledgeIndexOptions {
  scope: { id: string; [key: string]: unknown };
  workspaceRoot?: string;
}

export interface KnowledgeExecutionContext {
  scope: { id: string; [key: string]: unknown };
  sources: KnowledgeSource[];
  workspaceRoot?: string;
  limit?: number;
  profile?: { id: string };
  filters?: { sourceIds?: string[]; paths?: string[] };
}

export type IndexingStats = MindIndexStats;

export interface KnowledgeEngine {
  id: string;
  type: string;
  init(options?: Record<string, unknown>): Promise<void>;
  dispose(): Promise<void>;
  index(sources: KnowledgeSource[], options: KnowledgeIndexOptions): Promise<IndexingStats>;
  query(query: KnowledgeQuery, context: KnowledgeExecutionContext): Promise<KnowledgeResult>;
}

export function createKnowledgeError(code: string, message: string): Error {
  const error = new Error(message);
  error.name = code;
  return error;
}
