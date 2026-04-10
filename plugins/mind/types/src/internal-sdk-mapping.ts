import type {
  MindChunk,
  MindExecutionContext,
  MindIndexStats,
  MindQuery,
  MindQueryResult,
} from './index';

// Internal-only mapping helpers for SDK boundary adapters.
// Intentionally not exported from package root.
export const toSdkQuery = (query: MindQuery): Record<string, unknown> => ({
  text: query.text,
  intent: query.intent,
  limit: query.limit,
  profileId: query.profileId,
  metadata: query.metadata,
});

export const toSdkContext = (context: MindExecutionContext): Record<string, unknown> => context as unknown as Record<string, unknown>;
export const fromSdkResult = (result: Record<string, unknown>): MindQueryResult => result as unknown as MindQueryResult;
export const fromSdkIndexStats = (stats: Record<string, unknown>): MindIndexStats => stats as unknown as MindIndexStats;
export const fromSdkChunk = (chunk: Record<string, unknown>): MindChunk => chunk as unknown as MindChunk;
