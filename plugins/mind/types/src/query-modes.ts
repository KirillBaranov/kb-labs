/**
 * @module @kb-labs/mind-types/query-modes
 * Query execution modes and configuration
 */

/**
 * Query execution mode
 * - instant: Fast, vector-only search (~100-200ms)
 * - auto: Balanced hybrid search with adaptive reasoning (~500-1000ms)
 * - thinking: Deep reasoning with all optimizations (~2-5s)
 */
export type QueryMode = 'instant' | 'auto' | 'thinking';

/**
 * Configuration for a specific query mode
 */
export interface QueryModeConfig {
  /** Mode identifier */
  id: QueryMode;

  /** Human-readable description */
  description: string;

  /** Target latency in milliseconds */
  targetLatencyMs: number;

  /** Search configuration */
  search: {
    /** Enable hybrid search (vector + keyword) */
    hybrid: boolean;

    /** Vector search weight (0-1) */
    vectorWeight?: number;

    /** Keyword search weight (0-1) */
    keywordWeight?: number;

    /** Enable reranking */
    reranking: boolean;

    /** Reranking configuration */
    rerankingConfig?: {
      type: 'cross-encoder' | 'heuristic' | 'none';
      topK?: number;
    };
  };

  /** Reasoning configuration */
  reasoning: {
    /** Enable reasoning engine */
    enabled: boolean;

    /** Complexity threshold (0-1) */
    threshold: number;

    /** Maximum sub-queries */
    maxSubqueries?: number;

    /** Enable synthesis */
    synthesis?: boolean;
  };

  /** Learning features */
  learning: {
    /** Enable popularity boost */
    popularityBoost: boolean;

    /** Enable query patterns */
    queryPatterns: boolean;

    /** Enable adaptive weights */
    adaptiveWeights: boolean;
  };

  /** Compression/optimization */
  compression: {
    /** Enable compression */
    enabled: boolean;

    /** Enable LLM compression */
    llm: boolean;

    /** Smart truncation */
    smartTruncation: boolean;
  };

  /** Timeout in milliseconds */
  timeoutMs: number;
}

/**
 * Predefined query mode configurations
 */
export const QUERY_MODE_PRESETS: Record<QueryMode, QueryModeConfig> = {
  instant: {
    id: 'instant',
    description: 'Fast vector-only search for quick lookups',
    targetLatencyMs: 200,
    search: {
      hybrid: false,
      reranking: false,
    },
    reasoning: {
      enabled: false,
      threshold: 0.9, // Almost never trigger
    },
    learning: {
      popularityBoost: true, // Still useful for quick results
      queryPatterns: false,
      adaptiveWeights: false,
    },
    compression: {
      enabled: true,
      llm: false,
      smartTruncation: true,
    },
    timeoutMs: 500,
  },

  auto: {
    id: 'auto',
    description: 'Balanced hybrid search with adaptive reasoning',
    targetLatencyMs: 1000,
    search: {
      hybrid: true,
      vectorWeight: 0.7,
      keywordWeight: 0.3,
      reranking: false,
    },
    reasoning: {
      enabled: true,
      threshold: 0.6, // Current setting
      maxSubqueries: 3,
      synthesis: true,
    },
    learning: {
      popularityBoost: true,
      queryPatterns: true,
      adaptiveWeights: true,
    },
    compression: {
      enabled: true,
      llm: true,
      smartTruncation: true,
    },
    timeoutMs: 5000,
  },

  thinking: {
    id: 'thinking',
    description: 'Deep reasoning with comprehensive search',
    targetLatencyMs: 5000,
    search: {
      hybrid: true,
      vectorWeight: 0.6,
      keywordWeight: 0.4,
      reranking: true,
      rerankingConfig: {
        type: 'cross-encoder',
        topK: 20,
      },
    },
    reasoning: {
      enabled: true,
      threshold: 0.25, // More aggressive
      maxSubqueries: 5,
      synthesis: true,
    },
    learning: {
      popularityBoost: true,
      queryPatterns: true,
      adaptiveWeights: true,
    },
    compression: {
      enabled: true,
      llm: true,
      smartTruncation: true,
    },
    timeoutMs: 20000,
  },
};

/**
 * Get query mode configuration
 */
export function getQueryModeConfig(mode: QueryMode): QueryModeConfig {
  return QUERY_MODE_PRESETS[mode];
}

/**
 * Validate query mode
 */
export function isValidQueryMode(mode: string): mode is QueryMode {
  return mode === 'instant' || mode === 'auto' || mode === 'thinking';
}
