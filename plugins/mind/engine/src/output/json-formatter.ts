/**
 * @module @kb-labs/mind-engine/output/json-formatter
 * Format Mind query results as structured JSON for external integrations
 */

import type { KnowledgeResult } from '../types/engine-contracts';
import type {
  MindQueryResponse,
  MindCandidate,
  JsonOutputOptions,
  QueryMode,
} from '@kb-labs/mind-types';
import type { ReasoningResult } from '../reasoning/types';
import { SnippetExtractor } from '../snippets/snippet-extractor';

export interface QueryMetrics {
  totalMs: number;
  embeddingMs?: number;
  searchMs?: number;
  reasoningMs?: number;
  rerankingMs?: number;
  compressionMs?: number;
  totalTokens: number;
  estimatedCost: number;
}

// Create snippet extractor instance
const snippetExtractor = new SnippetExtractor({
  targetLines: 20,
  contextLines: 2,
});

/**
 * Format KnowledgeResult as JSON response
 */
export function formatAsJSON(
  result: KnowledgeResult,
  queryId: string,
  mode: QueryMode,
  metrics: QueryMetrics,
  reasoning?: ReasoningResult,
  options: JsonOutputOptions = {},
  queryText?: string
): MindQueryResponse {
  const candidates = result.chunks.map((chunk, index) =>
    formatCandidate(chunk, index, queryText, options)
  );

  const quality = calculateQuality(candidates);

  const response: MindQueryResponse = {
    id: queryId,
    created: Date.now(),
    mode,
    candidates,
    quality,
    usage: {
      totalTokens: metrics.totalTokens,
      estimatedCost: metrics.estimatedCost,
    },
    performance: {
      totalMs: metrics.totalMs,
    },
  };

  // Add performance breakdown if requested or in thinking mode
  if (options.includePerformanceBreakdown || mode === 'thinking') {
    response.performance.breakdown = {
      embeddingMs: metrics.embeddingMs ?? 0,
      searchMs: metrics.searchMs ?? 0,
      reasoningMs: metrics.reasoningMs,
      rerankingMs: metrics.rerankingMs,
      compressionMs: metrics.compressionMs,
    };
  }

  // Add reasoning information if available and requested
  if (reasoning?.reasoning && options.includeReasoning) {
    response.reasoning = {
      wasComplex: reasoning.reasoning.complexityScore > 0.5,
      subqueries: reasoning.reasoning.plan.subqueries?.map((sq) => sq.text),
      synthesis: result.contextText,
      complexityScore: reasoning.reasoning.complexityScore,
    };
  }

  return response;
}

/**
 * Format a single chunk as a candidate
 */
function formatCandidate(
  chunk: any,
  index: number,
  queryText: string | undefined,
  options: JsonOutputOptions
): MindCandidate {
  const chunkText = chunk.content || chunk.text || '';
  const chunkStartLine = chunk.span?.startLine ?? chunk.startLine ?? 0;
  const chunkEndLine = chunk.span?.endLine ?? chunk.endLine ?? 0;

  // Extract smart snippet
  const snippetResult = queryText
    ? snippetExtractor.extract(chunkText, chunkStartLine, queryText)
    : {
        code: chunkText,
        lines: [chunkStartLine, chunkEndLine] as [number, number],
        before: undefined,
        after: undefined,
        highlights: [],
        relevance: 1,
      };

  const candidate: MindCandidate = {
    index,
    score: chunk.score ?? chunk.relevance ?? 0,
    content: chunkText,
    snippet: {
      code: snippetResult.code,
      lines: snippetResult.lines,
      before: 'before' in snippetResult ? snippetResult.before : undefined,
      after: 'after' in snippetResult ? snippetResult.after : undefined,
      highlights: snippetResult.highlights,
      relevance: snippetResult.relevance,
    },
    context: {
      file: chunk.file || chunk.filePath || chunk.path || '',
      lines: [chunkStartLine, chunkEndLine],
      relevantLines: snippetResult.lines,
      type: inferCodeType(chunk),
      name: chunk.functionName || chunk.className || chunk.symbolName,
      symbolPath: buildSymbolPath(chunk),
      language: chunk.language,
      lastModified: chunk.lastModified,
      isStaged: chunk.isStaged,
    },
    match: {
      matchType: inferMatchType(chunk),
      matchedTerms: chunk.matchedTerms || extractMatchedTerms(chunk),
      semanticSimilarity: chunk.vectorScore || chunk.semanticScore,
      isExactMatch: chunk.isExactMatch ?? false,
      isConceptualMatch: chunk.isConceptualMatch ?? (chunk.score > 0.7),
    },
  };

  // Add imports/exports if available
  if (chunk.imports && chunk.imports.length > 0) {
    candidate.context.imports = chunk.imports.slice(0, 5); // Top 5
  }
  if (chunk.exports && chunk.exports.length > 0) {
    candidate.context.exports = chunk.exports.slice(0, 5); // Top 5
  }

  // Add related information if requested
  if (options.includeRelated && chunk.related) {
    candidate.related = {
      dependencies: chunk.related.dependencies?.slice(0, 5),
      dependents: chunk.related.dependents?.slice(0, 5),
      similarChunks: chunk.related.similarCount,
    };
  }

  return candidate;
}

/**
 * Infer code entity type from chunk metadata
 */
function inferCodeType(chunk: any): MindCandidate['context']['type'] {
  if (chunk.type) {return chunk.type;}
  if (chunk.functionName) {return 'function';}
  if (chunk.className) {return 'class';}
  if (chunk.interfaceName) {return 'interface';}
  if (chunk.typeName) {return 'type';}
  if (chunk.file?.endsWith('.json') || chunk.file?.endsWith('.yaml')) {return 'config';}
  if (chunk.file?.endsWith('.md')) {return 'docs';}
  return 'other';
}

/**
 * Build full symbol path
 */
function buildSymbolPath(chunk: any): string | undefined {
  const parts: string[] = [];

  if (chunk.className) {parts.push(chunk.className);}
  if (chunk.functionName) {parts.push(chunk.functionName);}
  if (chunk.symbolName && !parts.includes(chunk.symbolName)) {
    parts.push(chunk.symbolName);
  }

  return parts.length > 0 ? parts.join('.') : undefined;
}

/**
 * Infer match type from scores
 */
function inferMatchType(chunk: any): 'semantic' | 'keyword' | 'hybrid' {
  const hasVector = chunk.vectorScore !== undefined || chunk.semanticScore !== undefined;
  const hasKeyword = chunk.keywordScore !== undefined || chunk.bm25Score !== undefined;

  if (hasVector && hasKeyword) {return 'hybrid';}
  if (hasKeyword) {return 'keyword';}
  return 'semantic';
}

/**
 * Extract matched terms from chunk content
 */
function extractMatchedTerms(chunk: any): string[] | undefined {
  if (chunk.highlights) {
    return chunk.highlights.map((h: any) => h.text || h.term).filter(Boolean);
  }
  return undefined;
}

/**
 * Calculate quality metrics
 */
function calculateQuality(candidates: MindCandidate[]): MindQueryResponse['quality'] {
  if (candidates.length === 0) {
    return { confidence: 0, coverage: 0, completeness: 'minimal' };
  }

  // Confidence: average of top 3 scores
  const topScores = candidates.slice(0, 3).map((c) => c.score);
  const confidence = topScores.reduce((a, b) => a + b, 0) / topScores.length;

  // Coverage: score distribution consistency
  const allScores = candidates.slice(0, 10).map((c) => c.score);
  const scoreVariance = calculateVariance(allScores);
  const coverage = Math.max(0, 1 - scoreVariance);

  // Completeness: based on count and average score
  let completeness: 'full' | 'partial' | 'minimal' = 'minimal';
  if (candidates.length >= 5 && confidence > 0.7) {
    completeness = 'full';
  } else if (candidates.length >= 2 && confidence > 0.5) {
    completeness = 'partial';
  }

  return {
    confidence: Math.min(1, Math.max(0, confidence)),
    coverage: Math.min(1, Math.max(0, coverage)),
    completeness,
  };
}

/**
 * Calculate variance of scores
 */
function calculateVariance(values: number[]): number {
  if (values.length === 0) {return 0;}
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Serialize to JSON string
 */
export function serializeJSON(
  response: MindQueryResponse,
  pretty: boolean = false
): string {
  return JSON.stringify(response, null, pretty ? 2 : 0);
}
