/**
 * @module @kb-labs/mind-engine/search/adaptive-hybrid
 * Adaptive hybrid search with query classification and source boosting
 */

import type {
  EmbeddingVector,
  StoredMindChunk,
  VectorSearchFilters,
  VectorSearchMatch,
} from '../vector-store/vector-store';
import { hybridSearch, type HybridSearchOptions } from './hybrid';
import { keywordSearch } from './keyword';
import {
  classifyQueryWithLLMFallback,
  extractIdentifiers,
  type QueryClassification,
  type QueryClassifierLLMOptions,
} from './query-classifier';
import {
  categorizeMatches,
  categorizeFile,
  applyQueryBoost,
} from './source-categorizer';

export interface AdaptiveHybridSearchOptions extends HybridSearchOptions {
  /**
   * Enable adaptive weights based on query classification
   * Default: true
   */
  adaptiveWeights?: boolean;

  /**
   * Enable source-type boosting
   * Default: true
   */
  sourceBoost?: boolean;

  /**
   * Force specific weights (overrides adaptive)
   */
  forceWeights?: {
    vector: number;
    keyword: number;
  };

  /**
   * Optional LLM-assisted query classifier (rules-first, tool-calling fallback).
   */
  classifier?: QueryClassifierLLMOptions;
}

export interface AdaptiveSearchResult {
  matches: VectorSearchMatch[];
  classification: QueryClassification;
  usedWeights: { vector: number; keyword: number };
  identifiers: string[];
}

/**
 * Adaptive hybrid search with query classification
 */
export async function adaptiveHybridSearch(
  vectorSearch: (
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ) => Promise<VectorSearchMatch[]>,
  scopeId: string,
  queryVector: EmbeddingVector,
  queryText: string,
  allChunks: StoredMindChunk[],
  limit: number,
  filters?: VectorSearchFilters,
  options: AdaptiveHybridSearchOptions = {},
): Promise<AdaptiveSearchResult> {
  const {
    adaptiveWeights = true,
    sourceBoost = true,
    forceWeights,
    classifier,
    ...hybridOptions
  } = options;

  // Classify query (rules-first + optional LLM tool-calling fallback)
  const classification = await classifyQueryWithLLMFallback(queryText, classifier);
  const identifiers = extractIdentifiers(queryText);

  // Determine weights
  let usedWeights: { vector: number; keyword: number };

  if (forceWeights) {
    usedWeights = forceWeights;
  } else if (adaptiveWeights) {
    usedWeights = classification.weights;
  } else {
    usedWeights = { vector: 0.7, keyword: 0.3 };
  }

  // Use suggested limit from classification if not overridden
  const exactLookupLimit =
    classification.retrievalProfile === 'exact_lookup'
      ? Math.max(limit * 8, classification.suggestedLimit)
      : classification.suggestedLimit;
  const calibratedLimit =
    classification.recallStrategy === 'broad_recall'
      ? Math.max(exactLookupLimit, limit * 6)
      : exactLookupLimit;
  const effectiveLimit = options.candidateLimit
    ? Math.max(limit, options.candidateLimit)
    : Math.max(limit, calibratedLimit);

  if (classification.recallStrategy === 'broad_recall' && !forceWeights) {
    usedWeights = {
      vector: Math.max(usedWeights.vector, 0.55),
      keyword: Math.max(usedWeights.keyword, 0.45),
    };
  }

  // Run hybrid search with adaptive/calibrated weights
  const searchOptions: HybridSearchOptions = {
    ...hybridOptions,
    vectorWeight: usedWeights.vector,
    keywordWeight: usedWeights.keyword,
  };

  let matches = await hybridSearch(
    vectorSearch,
    keywordSearch,
    scopeId,
    queryVector,
    queryText,
    allChunks,
    effectiveLimit,
    filters,
    searchOptions,
  );

  // Apply source-type boosting if enabled
  if (sourceBoost && matches.length > 0) {
    const categorized = categorizeMatches(matches);
    const boosted = applyQueryBoost(categorized, queryText);

    // Re-sort by boosted scores
    boosted.sort((a, b) => b.score - a.score);

    // Convert back to VectorSearchMatch
    matches = boosted.slice(0, limit).map(m => ({
      chunk: m.chunk,
      score: m.score,
    }));
  }

  // Boost results containing exact identifiers
  if (identifiers.length > 0) {
    matches = boostExactIdentifiers(matches, identifiers);
  }

  matches = applyFeatureScoring(matches, queryText, classification, identifiers, limit);

  return {
    matches: matches.slice(0, limit),
    classification,
    usedWeights,
    identifiers,
  };
}

/**
 * Boost matches that contain exact identifiers from query
 */
export function boostExactIdentifiers(
  matches: VectorSearchMatch[],
  identifiers: string[],
): VectorSearchMatch[] {
  if (identifiers.length === 0) {
    return matches;
  }

  return matches
    .map(match => {
      const text = match.chunk.text;
      const path = match.chunk.path;
      const lowerText = text.toLowerCase();
      const lowerPath = path.toLowerCase();

      // Count how many identifiers appear in this chunk
      const exactMatches = identifiers.filter(identifier =>
        hasExactIdentifierMatch(text, path, identifier),
      );
      const fuzzyMatches = identifiers.filter(identifier => {
        const lowerId = identifier.toLowerCase();
        const normalizedId = normalizeComparable(identifier);
        return (
          lowerText.includes(lowerId) ||
          lowerPath.includes(lowerId) ||
          normalizeComparable(text).includes(normalizedId) ||
          normalizeComparable(path).includes(normalizedId)
        );
      });

      // Exact symbol matches should dominate lexical evidence.
      // Also prefer code files over markdown/docs for symbol-centric queries.
      let boostFactor = 1;
      boostFactor += exactMatches.length * 0.35;
      boostFactor += Math.max(0, fuzzyMatches.length - exactMatches.length) * 0.15;

      const hasSymbolEvidence = exactMatches.length > 0 || fuzzyMatches.length > 0;
      if (hasSymbolEvidence && isCodeLikePath(path)) {
        boostFactor *= 1.25;
      }
      if (hasSymbolEvidence && isDocLikePath(path) && !hasDefinitionEvidence(text, path)) {
        boostFactor *= 0.72;
      }
      if (!hasSymbolEvidence && isDocLikePath(path)) {
        boostFactor *= 0.75;
      } else if (!hasSymbolEvidence) {
        boostFactor *= 0.85;
      }

      return {
        chunk: match.chunk,
        score: match.score * boostFactor,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function applyFeatureScoring(
  matches: VectorSearchMatch[],
  queryText: string,
  classification: QueryClassification,
  identifiers: string[],
  limit: number,
): VectorSearchMatch[] {
  if (matches.length === 0) {
    return matches;
  }

  const queryTokens = extractQueryTokens(queryText);
  const technicalQuery = /\b(interface|method|function|class|field|parameter|type|schema|policy|stage|pipeline|command|cli)\b/i.test(queryText);
  const interfaceQuery = /\binterface\b/i.test(queryText);
  const methodsQuery = /\bmethods?\b/i.test(queryText);
  const errorQuery = /\b(error|exception|invalid|undefined|null|failed|failure)\b/i.test(queryText);
  const testQuery = /\b(test|spec|fixture|mock|coverage)\b/i.test(queryText);
  const architectureQuery = /\b(architecture|algorithm|flow|design|how\s+does|how\s+do|works?)\b/i.test(queryText);
  const lowerQuery = queryText.toLowerCase();

  const rescored = matches.map((match) => {
    const chunk = match.chunk;
    const category = categorizeFile(chunk.path);
    const lexicalHits = countLexicalHits(chunk, queryTokens);
    const exactIdentifierHits = identifiers.length > 0
      ? identifiers.filter((id) => hasIdentifierEvidence(chunk.text, chunk.path, id)).length
      : 0;
    const hasIdEvidence = exactIdentifierHits > 0;

    let factor = 1;
    factor *= categoryWeight(classification.retrievalProfile, category);
    factor *= lexicalWeight(classification.retrievalProfile, lexicalHits, category);

    if (classification.retrievalProfile === 'exact_lookup') {
      if (category === 'test' && !testQuery) {
        factor *= 0.72;
      }
      if (technicalQuery && (category === 'docs' || category === 'adr') && !hasIdEvidence) {
        factor *= 0.76;
      }
      if (interfaceQuery || methodsQuery) {
        const definitionLike = hasDefinitionEvidence(chunk.text, chunk.path);
        if ((category === 'docs' || category === 'adr') && !definitionLike) {
          factor *= 0.58;
        } else if ((category === 'code' || category === 'config') && definitionLike) {
          factor *= 1.12;
        }
      }
      if ((category === 'docs' || category === 'adr' || category === 'test') && lexicalHits === 0) {
        factor *= 0.7;
      }
      if (errorQuery && category === 'code') {
        factor *= 1.15;
      } else if (errorQuery && (category === 'docs' || category === 'adr')) {
        factor *= 0.74;
      }
    } else if (architectureQuery) {
      const lowerPath = chunk.path.toLowerCase();
      if (category === 'adr' || lowerPath.includes('/docs/adr/')) {
        factor *= 1.16;
      }
      if (looksLikeSearchImplementation(chunk.text, lowerPath)) {
        factor *= 1.08;
      }
      if (lowerPath.includes('/docs/') && /(plan|improvement|todo|task)/i.test(lowerPath)) {
        factor *= 0.78;
      }
      if (lowerQuery.includes('hybrid') && (lowerPath.includes('hybrid') || /\bhybrid\b/i.test(chunk.text))) {
        factor *= 1.14;
      }
      if (/\/index\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift)$/i.test(lowerPath)) {
        factor *= 0.86;
      }
    }

    return {
      chunk,
      score: match.score * factor,
    };
  });

  return rescored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function hasExactIdentifierMatch(text: string, filePath: string, identifier: string): boolean {
  const escaped = escapeRegExp(identifier);
  if (!escaped) {
    return false;
  }
  const pattern = new RegExp(`\\b${escaped}\\b`);
  return pattern.test(text) || pattern.test(filePath);
}

function hasIdentifierEvidence(text: string, filePath: string, identifier: string): boolean {
  if (hasExactIdentifierMatch(text, filePath, identifier)) {
    return true;
  }
  const normalizedIdentifier = normalizeComparable(identifier);
  if (!normalizedIdentifier) {
    return false;
  }
  return (
    normalizeComparable(text).includes(normalizedIdentifier) ||
    normalizeComparable(filePath).includes(normalizedIdentifier)
  );
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasDefinitionEvidence(text: string, filePath: string): boolean {
  if (isCodeLikePath(filePath)) {
    return true;
  }
  return (
    /\bexport\s+interface\b/i.test(text) ||
    /\binterface\s+[A-Z][A-Za-z0-9_]*\b/.test(text) ||
    /\bclass\s+[A-Z][A-Za-z0-9_]*\b/.test(text) ||
    /\bfunction\s+[a-zA-Z0-9_]+\s*\(/.test(text) ||
    /\b[A-Za-z0-9_]+\s*\([^)]*\)\s*:\s*[A-Za-z0-9_<>{}\[\]|]+\s*;/.test(text)
  );
}

function looksLikeSearchImplementation(text: string, lowerPath: string): boolean {
  if (isCodeLikePath(lowerPath)) {
    const implementationSignals = [
      /\bhybrid\s+search\b/i,
      /\badaptive\s+search\b/i,
      /\brrf\b/i,
      /\bbm25\b/i,
      /\bvector\s+weight\b/i,
      /\bkeyword\s+weight\b/i,
    ];
    if (implementationSignals.some((pattern) => pattern.test(text))) {
      return true;
    }
  }
  return /(hybrid|adaptive|retrieval|ranking|search)/i.test(lowerPath);
}

function extractQueryTokens(query: string): string[] {
  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'where', 'when', 'how', 'why', 'is', 'are',
    'was', 'were', 'can', 'does', 'into', 'about', 'show', 'find', 'tell', 'me', 'in', 'of', 'to', 'on', 'a',
    'an', 'by', 'or', 'it',
  ]);
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token));
}

function countLexicalHits(chunk: VectorSearchMatch['chunk'], tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const haystackPath = chunk.path.toLowerCase();
  const haystackText = chunk.text.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    if (haystackPath.includes(token) || haystackText.includes(token)) {
      hits += 1;
    }
  }
  return hits;
}

function lexicalWeight(
  profile: QueryClassification['retrievalProfile'],
  lexicalHits: number,
  category: ReturnType<typeof categorizeFile>,
): number {
  if (lexicalHits <= 0) {
    return profile === 'exact_lookup' && (category === 'docs' || category === 'adr') ? 0.82 : 1;
  }
  const perHit = profile === 'exact_lookup' ? 0.08 : 0.05;
  return 1 + Math.min(profile === 'exact_lookup' ? 0.36 : 0.2, lexicalHits * perHit);
}

function categoryWeight(
  profile: QueryClassification['retrievalProfile'],
  category: ReturnType<typeof categorizeFile>,
): number {
  if (profile === 'exact_lookup') {
    switch (category) {
      case 'code':
        return 1.18;
      case 'config':
        return 1.08;
      case 'docs':
        return 0.88;
      case 'adr':
        return 0.84;
      case 'test':
        return 0.78;
      default:
        return 0.95;
    }
  }

  switch (category) {
    case 'code':
      return 1.03;
    case 'docs':
      return 1.08;
    case 'adr':
      return 1.1;
    case 'test':
      return 0.92;
    default:
      return 1;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCodeLikePath(filePath: string): boolean {
  return /\.(ts|tsx|js|jsx|go|rs|py|java|kt|swift|c|cpp|h)$/i.test(filePath);
}

function isDocLikePath(filePath: string): boolean {
  return /\.(md|mdx|rst|txt)$/i.test(filePath) || /\/docs?\//i.test(filePath);
}

/**
 * Quick helper to get just matches (for simpler API)
 */
export async function adaptiveSearch(
  vectorSearch: (
    scopeId: string,
    vector: EmbeddingVector,
    limit: number,
    filters?: VectorSearchFilters,
  ) => Promise<VectorSearchMatch[]>,
  scopeId: string,
  queryVector: EmbeddingVector,
  queryText: string,
  allChunks: StoredMindChunk[],
  limit: number,
  filters?: VectorSearchFilters,
  options?: AdaptiveHybridSearchOptions,
): Promise<VectorSearchMatch[]> {
  const result = await adaptiveHybridSearch(
    vectorSearch,
    scopeId,
    queryVector,
    queryText,
    allChunks,
    limit,
    filters,
    options,
  );
  return result.matches;
}
