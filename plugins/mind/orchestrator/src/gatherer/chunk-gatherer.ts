/**
 * Chunk Gatherer
 *
 * Gathers chunks from mind-engine for multiple sub-queries,
 * deduplicates and merges results.
 */

import { useLogger } from '@kb-labs/sdk';
import type { MindChunk, MindIntent } from '@kb-labs/mind-types';
import type { AgentQueryMode } from '../types';
import type {
  DecomposedQuery,
  GatheredChunks,
  OrchestratorConfig,
  RetrievalTelemetry,
} from '../types';

const getLogger = () => useLogger().child({ category: 'mind:orchestrator:gatherer' });

export interface ChunkGathererOptions {
  config: OrchestratorConfig;
}

/**
 * Query function options with adaptive search weights
 */
export interface QueryFnOptions {
  text: string;
  intent?: MindIntent;
  limit?: number;
  /** Vector search weight (0-1), default 0.7 */
  vectorWeight?: number;
  /** Keyword search weight (0-1), default 0.3 */
  keywordWeight?: number;
}

export interface QueryFn {
  (options: QueryFnOptions): Promise<{
    chunks: MindChunk[];
    metadata: Record<string, unknown>;
  }>;
}

/**
 * Chunk Gatherer - collects chunks for all sub-queries
 */
export class ChunkGatherer {
  private readonly config: OrchestratorConfig;

  constructor(options: ChunkGathererOptions) {
    this.config = options.config;
  }

  /**
   * Gather chunks for decomposed query
   */
  async gather(
    decomposed: DecomposedQuery,
    mode: AgentQueryMode,
    queryFn: QueryFn,
  ): Promise<GatheredChunks> {
    const modeConfig = this.getModeConfig(mode);
    const subqueryResults = new Map<string, MindChunk[]>();
    const allChunks: MindChunk[] = [];
    const rawRetrievalSignals: RetrievalTelemetry[] = [];
    let totalMatches = 0;

    // Execute sub-queries in parallel
    const subqueryPromises = decomposed.subqueries.map(async (subquery) => {
      try {
        const weights = classifySubqueryWeights(subquery);
        const result = await queryFn({
          text: subquery,
          intent: 'search',
          limit: modeConfig.chunksPerQuery,
          vectorWeight: weights.vector,
          keywordWeight: weights.keyword,
        });
        const retrieval = extractRetrievalTelemetry(result.metadata);
        if (!retrieval) {
          throw new Error('Mind retrieval telemetry is required: missing required metadata fields in queryFn result');
        }

        return {
          subquery,
          chunks: result.chunks,
          retrieval,
        };
      } catch (error) {
        // Log error but continue with other sub-queries
        getLogger().warn(`Subquery failed: ${subquery}`, { error });
        return { subquery, chunks: [] };
      }
    });

    // Wait for all sub-queries to complete
    const results = await Promise.all(subqueryPromises);

    // Aggregate results
    for (const { subquery, chunks, retrieval } of results) {
      subqueryResults.set(subquery, chunks);
      allChunks.push(...chunks);
      totalMatches += chunks.length;
      if (retrieval) {
        rawRetrievalSignals.push(retrieval);
      }
    }

    // Deduplicate chunks
    const deduplicatedChunks = this.deduplicateChunks(allChunks);
    const rerankedChunks = rerankGatheredChunks(
      deduplicatedChunks,
      decomposed.original,
      mode,
    );

    // Limit total chunks based on mode
    const limitedChunks = rerankedChunks.slice(0, modeConfig.maxChunks);

    return {
      chunks: limitedChunks,
      subqueryResults,
      totalMatches,
      retrieval: aggregateRetrievalTelemetry(rawRetrievalSignals, mode),
    };
  }

  /**
   * Deduplicate chunks by ID, keeping highest score
   */
  private deduplicateChunks(chunks: MindChunk[]): MindChunk[] {
    const chunkMap = new Map<string, MindChunk>();

    for (const chunk of chunks) {
      const chunkId = chunk.id ?? chunk.chunkId ?? `${chunk.path}:${chunk.span.startLine}-${chunk.span.endLine}`;
      const existing = chunkMap.get(chunkId);
      const chunkScore = chunk.score ?? 0;
      if (!existing || chunkScore > (existing.score ?? 0)) {
        chunkMap.set(chunkId, chunk);
      }
    }

    // Sort by score descending
    return Array.from(chunkMap.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Get mode-specific configuration
   */
  private getModeConfig(mode: AgentQueryMode) {
    switch (mode) {
      case 'instant':
        return {
          chunksPerQuery: this.config.modes.instant.maxChunks,
          maxChunks: this.config.modes.instant.maxChunks,
        };
      case 'thinking':
        return {
          chunksPerQuery: this.config.modes.thinking.chunksPerQuery,
          maxChunks: this.config.modes.thinking.chunksPerQuery * this.config.modes.thinking.maxSubqueries,
        };
      default: // auto
        return {
          chunksPerQuery: this.config.modes.auto.chunksPerQuery,
          maxChunks: this.config.modes.auto.chunksPerQuery * this.config.modes.auto.maxSubqueries,
        };
    }
  }
}

export function createChunkGatherer(options: ChunkGathererOptions): ChunkGatherer {
  return new ChunkGatherer(options);
}

function extractRetrievalTelemetry(metadata?: Record<string, unknown>): RetrievalTelemetry | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }
  const hasRequired =
    typeof metadata.retrievalProfile === 'string' &&
    typeof metadata.stalenessLevel === 'string' &&
    typeof metadata.failClosed === 'boolean';
  if (!hasRequired) {
    return undefined;
  }
  return metadata as RetrievalTelemetry;
}

function aggregateRetrievalTelemetry(
  items: RetrievalTelemetry[],
  mode: AgentQueryMode,
): RetrievalTelemetry | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const stalenessOrder: Record<string, number> = {
    fresh: 0,
    'soft-stale': 1,
    'hard-stale': 2,
  };

  const mostSevereStaleness = items.reduce<'fresh' | 'soft-stale' | 'hard-stale'>((acc, current) => {
    const candidate = current.stalenessLevel ?? 'fresh';
    return (stalenessOrder[candidate] ?? 0) > (stalenessOrder[acc] ?? 0) ? candidate : acc;
  }, 'fresh');

  const indexRevisions = new Set(
    items
      .map((item) => item.indexRevision)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const engineConfigHashes = new Set(
    items
      .map((item) => item.engineConfigHash)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  const sourcesDigests = new Set(
    items
      .map((item) => item.sourcesDigest)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );

  const confidenceAdjustments = items
    .map((item) => item.confidenceAdjustments)
    .filter((value): value is NonNullable<RetrievalTelemetry['confidenceAdjustments']> => !!value);

  const mergedHints = Array.from(new Set(items.flatMap((item) => item.recoverableHints ?? [])));

  return {
    retrievalProfile: mode,
    freshnessApplied: items.some((item) => item.freshnessApplied === true),
    boostedCandidates: items.reduce((sum, item) => sum + (item.boostedCandidates ?? 0), 0),
    stalenessLevel: mostSevereStaleness,
    conflictsDetected: items.reduce((sum, item) => sum + (item.conflictsDetected ?? 0), 0),
    conflictTopics: items.reduce((sum, item) => sum + (item.conflictTopics ?? 0), 0),
    conflictPolicy: items.find((item) => item.conflictPolicy)?.conflictPolicy,
    confidence: Math.min(...items.map((item) => item.confidence ?? 1)),
    complete: items.every((item) => item.complete !== false),
    recoverable: items.some((item) => item.recoverable === true),
    failClosed: items.some((item) => item.failClosed === true),
    recoverableHints: mergedHints,
    confidenceAdjustments: confidenceAdjustments.length > 0
      ? {
          stalenessPenalty: Math.max(...confidenceAdjustments.map((adj) => adj.stalenessPenalty ?? 0)),
          conflictPenalty: Math.max(...confidenceAdjustments.map((adj) => adj.conflictPenalty ?? 0)),
          floorGap: Math.max(...confidenceAdjustments.map((adj) => adj.floorGap ?? 0)),
          finalConfidence: Math.min(...confidenceAdjustments.map((adj) => adj.finalConfidence ?? 1)),
        }
      : undefined,
    indexRevision: indexRevisions.size === 1 ? Array.from(indexRevisions)[0]! : null,
    engineConfigHash: engineConfigHashes.size === 1 ? Array.from(engineConfigHashes)[0]! : null,
    sourcesDigest: sourcesDigests.size === 1 ? Array.from(sourcesDigests)[0]! : null,
  };
}

export function rerankGatheredChunks(
  chunks: MindChunk[],
  query: string,
  mode: AgentQueryMode,
): MindChunk[] {
  if (chunks.length === 0) {
    return chunks;
  }

  const identifiers = extractTechnicalIdentifiers(query);
  const technicalQuery = isTechnicalQuery(query) || identifiers.length > 0;
  const architectureQuery = /\b(architecture|design|algorithm|flow|how\s+does|how\s+do|works?)\b/i.test(query);
  const commandQuery = /\b(cli|command|subcommand|flag|option)\b/i.test(query) || /\b[a-z0-9]+(?:-[a-z0-9]+)+\b/.test(query);
  if (!technicalQuery) {
    return chunks;
  }

  const reranked = chunks
    .map((chunk) => {
      const idMatches = countIdentifierMatches(chunk, identifiers);
      const kind = inferChunkKind(chunk.path);

      let score = chunk.score;
      if (idMatches > 0) {
        score *= 1 + Math.min(0.5, idMatches * 0.25);
      }

      const codeLike = kind === 'code' || kind === 'config';
      if (codeLike) {
        score *= mode === 'thinking' ? 1.2 : 1.1;
      } else if (kind === 'doc' && idMatches === 0) {
        score *= mode === 'thinking' ? 0.72 : 0.85;
      }

      const lowerPath = chunk.path.toLowerCase();
      if (architectureQuery) {
        if (lowerPath.includes('/docs/adr/')) {
          score *= 1.14;
        }
        if ((lowerPath.includes('/docs/') || lowerPath.endsWith('.md')) && /(plan|improvement|todo|task)/i.test(lowerPath)) {
          score *= 0.8;
        }
      }
      if (commandQuery) {
        if (lowerPath.includes('/cli/') || lowerPath.includes('/commands/') || /\bpackage\.json$/.test(lowerPath)) {
          score *= 1.16;
        } else if (kind === 'doc' && idMatches === 0) {
          score *= 0.84;
        }
      }

      return {
        ...chunk,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ensureCodeEvidenceInTopWindow(reranked, mode);
}

export function classifySubqueryWeights(subquery: string): { vector: number; keyword: number } {
  const trimmed = subquery.trim();
  const lower = trimmed.toLowerCase();
  const identifiers = extractTechnicalIdentifiers(trimmed);
  const hasIdentifier = identifiers.length > 0;

  if (
    hasIdentifier ||
    /^what\s+is\s+/i.test(trimmed) ||
    /\b(where|find)\b/i.test(lower)
  ) {
    return { vector: 0.3, keyword: 0.7 };
  }

  if (/^how\s+does\s+/i.test(trimmed) || /\b(architecture|design|algorithm|flow)\b/i.test(lower)) {
    return { vector: 0.75, keyword: 0.25 };
  }

  if (/\b(error|bug|exception|undefined|null)\b/i.test(lower)) {
    return { vector: 0.5, keyword: 0.5 };
  }

  return { vector: 0.6, keyword: 0.4 };
}

function ensureCodeEvidenceInTopWindow(
  chunks: MindChunk[],
  mode: AgentQueryMode,
): MindChunk[] {
  const topWindow = mode === 'thinking' ? 5 : 3;
  const top = chunks.slice(0, topWindow);
  if (top.some(chunk => inferChunkKind(chunk.path) === 'code')) {
    return chunks;
  }

  const firstCodeIndex = chunks.findIndex(chunk => inferChunkKind(chunk.path) === 'code');
  if (firstCodeIndex <= 0) {
    return chunks;
  }

  const copy = [...chunks];
  const [codeChunk] = copy.splice(firstCodeIndex, 1);
  if (!codeChunk) {
    return chunks;
  }
  copy.splice(Math.min(topWindow - 1, copy.length), 0, codeChunk);
  return copy;
}

function countIdentifierMatches(chunk: MindChunk, identifiers: string[]): number {
  if (identifiers.length === 0) {
    return 0;
  }
  const text = chunk.text;
  const filePath = chunk.path;
  let matches = 0;
  for (const identifier of identifiers) {
    const escaped = escapeRegExp(identifier);
    if (!escaped) {
      continue;
    }
    const pattern = new RegExp(`\\b${escaped}\\b`);
    if (pattern.test(text) || pattern.test(filePath)) {
      matches += 1;
    }
  }
  return matches;
}

function extractTechnicalIdentifiers(query: string): string[] {
  const identifiers = new Set<string>();

  for (const match of query.matchAll(/`([^`]+)`/g)) {
    if (match[1]) {
      identifiers.add(match[1]);
    }
  }
  for (const match of query.matchAll(/\b[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*\b/g)) {
    if (match[0]) {
      identifiers.add(match[0]);
    }
  }
  for (const match of query.matchAll(/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g)) {
    if (match[0]) {
      identifiers.add(match[0]);
    }
  }
  for (const match of query.matchAll(/\b[a-z]+_[a-z0-9_]+\b/g)) {
    if (match[0]) {
      identifiers.add(match[0]);
    }
  }
  for (const match of query.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g)) {
    if (match[0]) {
      identifiers.add(match[0]);
    }
  }
  for (const match of query.matchAll(/--[a-z0-9-]+/g)) {
    if (match[0]) {
      identifiers.add(match[0]);
    }
  }

  return Array.from(identifiers);
}

function isTechnicalQuery(query: string): boolean {
  return /\b(interface|method|function|class|field|parameter|config|policy|implementation|algorithm|architecture|design|flow|cli|command|subcommand|flag|option)\b/i.test(query);
}

function inferChunkKind(filePath: string): 'code' | 'doc' | 'config' | 'other' {
  const normalized = filePath.toLowerCase();
  if (/\.(ts|tsx|js|jsx|go|rs|py|java|kt|swift|c|cpp|h)$/.test(normalized)) {
    return 'code';
  }
  if (/\.(json|yaml|yml|toml|ini|env)$/.test(normalized) || normalized.includes('config')) {
    return 'config';
  }
  if (/\.(md|mdx|rst|txt)$/.test(normalized) || normalized.includes('/docs/')) {
    return 'doc';
  }
  return 'other';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
