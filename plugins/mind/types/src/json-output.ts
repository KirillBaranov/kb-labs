/**
 * @module @kb-labs/mind-types/json-output
 * JSON output format for external integrations
 */

import type { QueryMode } from './query-modes';

/**
 * Structured JSON response for Mind queries
 * Designed to be consumed by AI agents and external systems
 */
export interface MindQueryResponse {
  /** Unique query ID */
  id: string;

  /** Creation timestamp (Unix ms) */
  created: number;

  /** Query execution mode */
  mode: QueryMode;

  /** Result candidates */
  candidates: MindCandidate[];

  /** Quality metrics */
  quality: {
    /** Overall confidence (0-1) */
    confidence: number;

    /** Query coverage (0-1) - how much of query was addressed */
    coverage: number;

    /** Completeness indicator */
    completeness: 'full' | 'partial' | 'minimal';
  };

  /** Resource usage */
  usage: {
    /** Total tokens used */
    totalTokens: number;

    /** Estimated cost in USD */
    estimatedCost: number;
  };

  /** Performance metrics */
  performance: {
    /** Total duration in milliseconds */
    totalMs: number;

    /** Detailed breakdown (only in thinking mode) */
    breakdown?: {
      embeddingMs: number;
      searchMs: number;
      reasoningMs?: number;
      rerankingMs?: number;
      compressionMs?: number;
    };
  };

  /** Reasoning information (if reasoning was used) */
  reasoning?: {
    /** Was query complex enough for reasoning */
    wasComplex: boolean;

    /** Sub-queries executed */
    subqueries?: string[];

    /** Synthesis summary */
    synthesis?: string;

    /** Complexity score */
    complexityScore?: number;
  };
}

/**
 * Individual search result candidate
 */
export interface MindCandidate {
  /** Position in results (0-indexed) */
  index: number;

  /** Final relevance score (0-1) */
  score: number;

  /** Full chunk content (may be large) */
  content: string;

  /** Smart snippet - relevant portion only */
  snippet: {
    /** Extracted relevant code */
    code: string;

    /** Precise line range for snippet */
    lines: [number, number];

    /** Context before (2-3 lines) */
    before?: string;

    /** Context after (2-3 lines) */
    after?: string;

    /** Highlighted matches */
    highlights?: Array<{
      text: string;
      reason: 'exact-match' | 'semantic-match' | 'keyword-match';
      /** Line number where highlight appears */
      line?: number;
    }>;

    /** Confidence that this snippet is relevant (0-1) */
    relevance: number;
  };

  /** Context information */
  context: {
    /** File path (relative to project root) */
    file: string;

    /** Full chunk line range [start, end] */
    lines: [number, number];

    /** Relevant portion line range (subset of lines) */
    relevantLines?: [number, number];

    /** Code entity type */
    type: 'function' | 'class' | 'interface' | 'type' | 'config' | 'docs' | 'other';

    /** Symbol name (if applicable) */
    name?: string;

    /** Key imports in this file */
    imports?: string[];

    /** Exports from this chunk */
    exports?: string[];

    /** Full symbol path (e.g., "UserService.authenticate.validateToken") */
    symbolPath?: string;

    /** Last modified timestamp */
    lastModified?: number;

    /** Has uncommitted changes */
    isStaged?: boolean;

    /** Programming language */
    language?: string;
  };

  /** Match information */
  match: {
    /** How this chunk matched the query */
    matchType: 'semantic' | 'keyword' | 'hybrid';

    /** Matched keywords/terms */
    matchedTerms?: string[];

    /** Semantic similarity score (cosine) */
    semanticSimilarity?: number;

    /** Exact match flags */
    isExactMatch: boolean;
    isConceptualMatch: boolean;
  };

  /** Related information (optional) */
  related?: {
    /** Files this depends on */
    dependencies?: string[];

    /** Files that depend on this */
    dependents?: string[];

    /** Number of similar chunks */
    similarChunks?: number;
  };
}

/**
 * Options for JSON output formatting
 */
export interface JsonOutputOptions {
  /** Include related information */
  includeRelated?: boolean;

  /** Include embeddings vectors */
  includeEmbeddings?: boolean;

  /** Include reasoning details */
  includeReasoning?: boolean;

  /** Include performance breakdown */
  includePerformanceBreakdown?: boolean;

  /** Pretty print JSON */
  pretty?: boolean;
}

/**
 * Create initial response structure
 */
export function createMindQueryResponse(options: {
  queryId: string;
  mode: QueryMode;
}): MindQueryResponse {
  return {
    id: options.queryId,
    created: Date.now(),
    mode: options.mode,
    candidates: [],
    quality: {
      confidence: 0,
      coverage: 0,
      completeness: 'minimal',
    },
    usage: {
      totalTokens: 0,
      estimatedCost: 0,
    },
    performance: {
      totalMs: 0,
    },
  };
}

/**
 * Calculate quality metrics from candidates
 */
export function calculateQualityMetrics(candidates: MindCandidate[]): {
  confidence: number;
  coverage: number;
  completeness: 'full' | 'partial' | 'minimal';
} {
  if (candidates.length === 0) {
    return { confidence: 0, coverage: 0, completeness: 'minimal' };
  }

  // Confidence based on top scores
  const topScores = candidates.slice(0, 5).map((c) => c.score);
  const avgTopScore = topScores.reduce((a, b) => a + b, 0) / topScores.length;
  const confidence = Math.min(1, avgTopScore * 1.2); // Boost slightly

  // Coverage based on score distribution
  const scoreStdDev = calculateStdDev(topScores);
  const coverage = scoreStdDev < 0.1 ? 1 : Math.max(0.5, 1 - scoreStdDev * 2);

  // Completeness based on count and scores
  let completeness: 'full' | 'partial' | 'minimal' = 'minimal';
  if (candidates.length >= 5 && avgTopScore > 0.7) {
    completeness = 'full';
  } else if (candidates.length >= 3 && avgTopScore > 0.5) {
    completeness = 'partial';
  }

  return { confidence, coverage, completeness };
}

function calculateStdDev(values: number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}
