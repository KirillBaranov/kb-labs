/**
 * @module @kb-labs/mind-engine/reranking/smart-heuristic-reranker
 * Multi-factor heuristic reranker without LLM calls
 * Optimized for instant mode and fallback scenarios
 */

import type { VectorSearchMatch } from '../vector-store/vector-store';
import type { Reranker, RerankingOptions } from './reranker';

export interface SmartHeuristicRerankerOptions {
  /** Weight for exact phrase match (0-1) */
  exactMatchWeight?: number;
  /** Weight for symbol/identifier match (0-1) */
  symbolMatchWeight?: number;
  /** Weight for definition bonus (0-1) */
  definitionWeight?: number;
  /** Weight for path relevance (0-1) */
  pathRelevanceWeight?: number;
  /** Weight for term density (0-1) */
  termDensityWeight?: number;
  /** Weight for position bonus (earlier in file = better) (0-1) */
  positionWeight?: number;
}

export interface HeuristicScoreBreakdown {
  exactMatch: number;
  symbolMatch: number;
  definitionBonus: number;
  pathRelevance: number;
  termDensity: number;
  positionBonus: number;
  originalScore: number;
  total: number;
}

const DEFAULT_WEIGHTS: Required<SmartHeuristicRerankerOptions> = {
  exactMatchWeight: 0.25,
  symbolMatchWeight: 0.20,
  definitionWeight: 0.15,
  pathRelevanceWeight: 0.10,
  termDensityWeight: 0.15,
  positionWeight: 0.05,
};

// Patterns for detecting definitions
const DEFINITION_PATTERNS = [
  /^export\s+(function|class|interface|type|const|enum|let|var)\s+/m,
  /^(function|class|interface|type)\s+\w+/m,
  /^(const|let|var)\s+\w+\s*=\s*(function|\(|async|\{|class)/m,
  /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*\w+\s*\([^)]*\)\s*[:{]/m,
  /^(export\s+)?default\s+(function|class)/m,
];

// Patterns for extracting symbol names
const SYMBOL_PATTERNS = [
  /(?:function|class|interface|type|enum)\s+(\w+)/g,
  /(?:const|let|var)\s+(\w+)\s*=/g,
  /(\w+)\s*\([^)]*\)\s*[:{]/g,
  /export\s+{\s*([^}]+)\s*}/g,
];

/**
 * Smart Heuristic Reranker - multi-factor scoring without LLM
 */
export class SmartHeuristicReranker implements Reranker {
  private readonly weights: Required<SmartHeuristicRerankerOptions>;

  constructor(options: SmartHeuristicRerankerOptions = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options };
  }

  async rerank(
    query: string,
    matches: VectorSearchMatch[],
    options: RerankingOptions = {},
  ): Promise<VectorSearchMatch[]> {
    const opts = {
      topK: options.topK ?? 20,
      minScore: options.minScore ?? 0,
      normalize: options.normalize ?? true,
    };

    const candidates = matches.slice(0, opts.topK);
    if (candidates.length === 0) {
      return matches;
    }

    // Extract query terms and identifiers
    const queryLower = query.toLowerCase();
    const queryTerms = this.extractTerms(queryLower);
    const queryIdentifiers = this.extractIdentifiers(query);

    // Score each candidate
    const scored = candidates.map(match => {
      const breakdown = this.calculateScore(
        match,
        queryLower,
        queryTerms,
        queryIdentifiers,
      );
      return { match, breakdown };
    });

    // Filter by minimum score
    const filtered = scored.filter(s => s.breakdown.total >= opts.minScore);

    // Normalize if requested
    if (opts.normalize && filtered.length > 0) {
      const maxScore = Math.max(...filtered.map(s => s.breakdown.total));
      const minScore = Math.min(...filtered.map(s => s.breakdown.total));
      const range = maxScore - minScore;

      if (range > 0) {
        for (const item of filtered) {
          item.breakdown.total = (item.breakdown.total - minScore) / range;
        }
      }
    }

    // Sort by total score
    filtered.sort((a, b) => b.breakdown.total - a.breakdown.total);

    // Combine with remaining matches
    const reranked = filtered.map(item => ({
      chunk: item.match.chunk,
      score: item.breakdown.total,
    }));

    const remaining = matches.slice(opts.topK);
    return [...reranked, ...remaining];
  }

  /**
   * Calculate multi-factor score for a match
   */
  private calculateScore(
    match: VectorSearchMatch,
    queryLower: string,
    queryTerms: string[],
    queryIdentifiers: string[],
  ): HeuristicScoreBreakdown {
    const text = match.chunk.text;
    const textLower = text.toLowerCase();
    const path = match.chunk.path.toLowerCase();

    // 1. Exact phrase match (query appears verbatim)
    const exactMatch = textLower.includes(queryLower) ? 1 : 0;

    // 2. Symbol/identifier match
    const chunkSymbols = this.extractSymbols(text);
    const symbolMatches = queryIdentifiers.filter(id =>
      chunkSymbols.some(s => s.toLowerCase().includes(id.toLowerCase()))
    );
    const symbolMatch = queryIdentifiers.length > 0
      ? symbolMatches.length / queryIdentifiers.length
      : 0;

    // 3. Definition bonus (is this a definition vs usage?)
    const definitionBonus = this.isDefinition(text) ? 1 : 0;

    // 4. Path relevance (query terms appear in path)
    const pathMatches = queryTerms.filter(term => path.includes(term));
    const pathRelevance = queryTerms.length > 0
      ? pathMatches.length / queryTerms.length
      : 0;

    // 5. Term density (what % of query terms appear in chunk)
    const termMatches = queryTerms.filter(term => textLower.includes(term));
    const termDensity = queryTerms.length > 0
      ? termMatches.length / queryTerms.length
      : 0;

    // 6. Position bonus (earlier in file is often more relevant)
    const startLine = match.chunk.span.startLine;
    const positionBonus = Math.max(0, 1 - startLine / 1000);

    // Calculate weighted total
    const total =
      exactMatch * this.weights.exactMatchWeight +
      symbolMatch * this.weights.symbolMatchWeight +
      definitionBonus * this.weights.definitionWeight +
      pathRelevance * this.weights.pathRelevanceWeight +
      termDensity * this.weights.termDensityWeight +
      positionBonus * this.weights.positionWeight +
      match.score * 0.10; // Keep some original score influence

    return {
      exactMatch,
      symbolMatch,
      definitionBonus,
      pathRelevance,
      termDensity,
      positionBonus,
      originalScore: match.score,
      total,
    };
  }

  /**
   * Extract search terms from query
   */
  private extractTerms(query: string): string[] {
    return query
      .split(/\s+/)
      .filter(term => term.length > 2)
      .filter(term => !STOP_WORDS.has(term));
  }

  /**
   * Extract identifiers from query (CamelCase, snake_case)
   */
  private extractIdentifiers(query: string): string[] {
    const identifiers: string[] = [];

    // Backtick identifiers
    const backticks = query.match(/`([^`]+)`/g);
    if (backticks) {
      identifiers.push(...backticks.map(s => s.slice(1, -1)));
    }

    // PascalCase
    const pascalCase = query.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
    if (pascalCase) {
      identifiers.push(...pascalCase);
    }

    // camelCase
    const camelCase = query.match(/\b[a-z]+[A-Z][a-zA-Z0-9]*\b/g);
    if (camelCase) {
      identifiers.push(...camelCase);
    }

    // snake_case
    const snakeCase = query.match(/\b\w+_\w+\b/g);
    if (snakeCase) {
      identifiers.push(...snakeCase);
    }

    return [...new Set(identifiers)];
  }

  /**
   * Extract symbol names from code chunk
   */
  private extractSymbols(text: string): string[] {
    const symbols: string[] = [];

    for (const pattern of SYMBOL_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) {
          // Handle export { a, b, c } case
          if (match[1].includes(',')) {
            symbols.push(...match[1].split(',').map(s => s.trim()));
          } else {
            symbols.push(match[1]);
          }
        }
      }
    }

    return [...new Set(symbols)];
  }

  /**
   * Check if chunk contains a definition
   */
  private isDefinition(text: string): boolean {
    return DEFINITION_PATTERNS.some(pattern => pattern.test(text));
  }
}

// Common stop words to filter from query terms
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
  'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'or', 'if',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
]);

export function createSmartHeuristicReranker(
  options?: SmartHeuristicRerankerOptions,
): SmartHeuristicReranker {
  return new SmartHeuristicReranker(options);
}
