/**
 * @module @kb-labs/mind-engine/snippets/snippet-extractor
 * Smart snippet extraction for code chunks
 *
 * Extracts the most relevant portion of a code chunk based on query,
 * reducing token usage for AI agents while preserving context.
 */

import { ParserFactory, type LanguageParser } from '../parsers/language-parser';
import { TreeSitterParser } from '../parsers/tree-sitter-parser';

export interface SnippetExtractionResult {
  /** Extracted snippet code */
  code: string;

  /** Line range for snippet (absolute in file) */
  lines: [number, number];

  /** Context before snippet */
  before?: string;

  /** Context after snippet */
  after?: string;

  /** Highlighted matches */
  highlights: Array<{
    text: string;
    reason: 'exact-match' | 'semantic-match' | 'keyword-match';
    line?: number;
  }>;

  /** Relevance score (0-1) */
  relevance: number;
}

export interface SnippetExtractionOptions {
  /** Target snippet size (in lines) */
  targetLines?: number;

  /** Context lines before/after */
  contextLines?: number;

  /** Minimum relevance threshold */
  minRelevance?: number;

  /** Include exact match highlights */
  highlightExactMatches?: boolean;

  /** Include semantic match highlights */
  highlightSemanticMatches?: boolean;

  /** Programming language (for parser selection) */
  language?: string;
}

// Register Tree-sitter parsers for supported languages
['typescript', 'tsx', 'javascript', 'jsx', 'python', 'go', 'rust', 'java', 'c', 'cpp', 'csharp'].forEach(lang => {
  const parser = new TreeSitterParser(lang);
  ParserFactory.register(lang, parser);
});

/**
 * Extract smart snippet from chunk based on query
 */
export class SnippetExtractor {
  private readonly options: Required<Omit<SnippetExtractionOptions, 'language'>>;
  private parser: LanguageParser;

  constructor(options: SnippetExtractionOptions = {}) {
    this.options = {
      targetLines: options.targetLines ?? 20,
      contextLines: options.contextLines ?? 2,
      minRelevance: options.minRelevance ?? 0.3,
      highlightExactMatches: options.highlightExactMatches ?? true,
      highlightSemanticMatches: options.highlightSemanticMatches ?? true,
    };

    // Get parser for language (fallback to generic)
    this.parser = ParserFactory.getParser(options.language ?? 'generic');
  }

  /**
   * Extract snippet from chunk
   */
  extract(
    chunkText: string,
    chunkStartLine: number,
    query: string,
    semanticScores?: Map<number, number>, // line number -> semantic score
  ): SnippetExtractionResult {
    const lines = chunkText.split('\n');

    // Calculate relevance score for each line
    const lineScores = this.calculateLineScores(lines, query, semanticScores);

    // Find best continuous section with AST-based boundary detection
    const bestSection = this.findBestSection(chunkText, lines, lineScores);

    // Extract snippet with context
    const snippetStart = Math.max(0, bestSection.start);
    const snippetEnd = Math.min(lines.length, bestSection.end);

    const snippetLines = lines.slice(snippetStart, snippetEnd);
    const code = snippetLines.join('\n');

    // Add context
    const beforeStart = Math.max(0, snippetStart - this.options.contextLines);
    const before = snippetStart > 0
      ? lines.slice(beforeStart, snippetStart).join('\n')
      : undefined;

    const afterEnd = Math.min(lines.length, snippetEnd + this.options.contextLines);
    const after = snippetEnd < lines.length
      ? lines.slice(snippetEnd, afterEnd).join('\n')
      : undefined;

    // Find highlights
    const highlights = this.findHighlights(snippetLines, query, snippetStart);

    // Calculate relevance
    const relevance = bestSection.score;

    return {
      code,
      lines: [
        chunkStartLine + snippetStart,
        chunkStartLine + snippetEnd - 1,
      ],
      before,
      after,
      highlights,
      relevance,
    };
  }

  /**
   * Calculate relevance score for each line
   */
  private calculateLineScores(
    lines: string[],
    query: string,
    semanticScores?: Map<number, number>,
  ): number[] {
    const queryTokens = this.tokenize(query.toLowerCase());
    const scores: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineTokens = this.tokenize(line.toLowerCase());

      let score = 0;

      // Exact match score
      if (this.options.highlightExactMatches) {
        const exactMatches = queryTokens.filter(qt => lineTokens.includes(qt));
        score += exactMatches.length / queryTokens.length * 0.6;
      }

      // Semantic score (if provided)
      if (semanticScores && this.options.highlightSemanticMatches) {
        const semanticScore = semanticScores.get(i) ?? 0;
        score += semanticScore * 0.4;
      }

      // Boost for code structure keywords
      const structureKeywords = ['function', 'class', 'interface', 'type', 'const', 'export', 'import'];
      const hasStructure = structureKeywords.some(kw => line.toLowerCase().includes(kw));
      if (hasStructure) {
        score *= 1.2;
      }

      scores.push(Math.min(1, score));
    }

    return scores;
  }

  /**
   * Find best continuous section based on scores
   */
  private findBestSection(
    chunkText: string,
    lines: string[],
    scores: number[],
  ): { start: number; end: number; score: number } {
    const targetLines = this.options.targetLines;
    let bestStart = 0;
    let bestEnd = Math.min(targetLines, lines.length);
    let bestScore = 0;

    // Sliding window to find best section
    for (let start = 0; start < lines.length; start++) {
      const end = Math.min(start + targetLines, lines.length);
      const sectionScores = scores.slice(start, end);
      const avgScore = sectionScores.reduce((a, b) => a + b, 0) / sectionScores.length;

      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestStart = start;
        bestEnd = end;
      }
    }

    // Expand to complete statements using AST or fallback to regex
    bestStart = this.expandToStatementStart(chunkText, lines, bestStart);
    bestEnd = this.expandToStatementEnd(chunkText, lines, bestEnd);

    return { start: bestStart, end: bestEnd, score: bestScore };
  }

  /**
   * Expand to statement start (find opening brace/keyword)
   * Uses AST-based boundaries when available, falls back to regex
   */
  private expandToStatementStart(chunkText: string, lines: string[], start: number): number {
    // Try to get AST-based boundaries
    const boundaries = this.parser.findStatementBoundaries(chunkText);

    if (boundaries.length > 0) {
      // Find the boundary that contains or is closest before the start line
      for (let i = boundaries.length - 1; i >= 0; i--) {
        const boundary = boundaries[i];
        if (boundary && boundary.start <= start && boundary.end >= start) {
          // We're inside this boundary, use its start
          return boundary.start;
        }
        if (boundary && boundary.end < start) {
          // This boundary ends before our start, we're done
          break;
        }
      }
    }

    // Fallback to regex-based expansion
    const maxExpand = 5;
    let current = start;

    while (current > Math.max(0, start - maxExpand)) {
      const line = lines[current - 1];
      if (!line) {break;}

      const trimmed = line.trim();

      // Stop at blank lines or clear statement boundaries
      if (trimmed === '' || this.isStatementBoundary(trimmed)) {
        break;
      }

      current--;
    }

    return current;
  }

  /**
   * Expand to statement end (find closing brace)
   * Uses AST-based boundaries when available, falls back to regex
   */
  private expandToStatementEnd(chunkText: string, lines: string[], end: number): number {
    // Try to get AST-based boundaries
    const boundaries = this.parser.findStatementBoundaries(chunkText);

    if (boundaries.length > 0) {
      // Find the boundary that contains or is closest after the end line
      for (const boundary of boundaries) {
        if (boundary && boundary.start <= end && boundary.end >= end) {
          // We're inside this boundary, use its end
          return Math.min(boundary.end + 1, lines.length);
        }
        if (boundary && boundary.start > end) {
          // This boundary starts after our end, we're done
          break;
        }
      }
    }

    // Fallback to regex-based expansion
    const maxExpand = 5;
    let current = end;

    while (current < Math.min(lines.length, end + maxExpand)) {
      const line = lines[current];
      if (!line) {break;}

      const trimmed = line.trim();

      // Stop after closing braces or semicolons
      if (this.isStatementEnd(trimmed)) {
        current++;
        break;
      }

      current++;
    }

    return current;
  }

  /**
   * Check if line is statement boundary
   */
  private isStatementBoundary(line: string): boolean {
    // Common patterns for statement starts
    const patterns = [
      /^(export\s+)?(async\s+)?function\s+/,
      /^(export\s+)?(default\s+)?class\s+/,
      /^(export\s+)?interface\s+/,
      /^(export\s+)?type\s+/,
      /^(export\s+)?const\s+/,
      /^(export\s+)?let\s+/,
      /^(export\s+)?var\s+/,
      /^import\s+/,
      /^\/\*\*/, // JSDoc
      /^\/\//,   // Comment
    ];

    return patterns.some(p => p.test(line));
  }

  /**
   * Check if line is statement end
   */
  private isStatementEnd(line: string): boolean {
    return line.endsWith('}') || line.endsWith(';') || line.endsWith(',');
  }

  /**
   * Find highlights in snippet
   */
  private findHighlights(
    snippetLines: string[],
    query: string,
    snippetStartLine: number,
  ): Array<{ text: string; reason: 'exact-match' | 'semantic-match' | 'keyword-match'; line?: number }> {
    const queryTokens = this.tokenize(query.toLowerCase());
    const highlights: Array<{ text: string; reason: 'exact-match' | 'semantic-match' | 'keyword-match'; line?: number }> = [];

    for (let i = 0; i < snippetLines.length; i++) {
      const line = snippetLines[i] ?? '';
      const lineTokens = this.tokenize(line.toLowerCase());

      // Find exact matches
      for (const token of queryTokens) {
        if (lineTokens.includes(token)) {
          // Find original case version
          const originalMatch = this.findOriginalMatch(line, token);
          if (originalMatch && !highlights.some(h => h.text === originalMatch)) {
            highlights.push({
              text: originalMatch,
              reason: 'exact-match',
              line: snippetStartLine + i,
            });
          }
        }
      }
    }

    // Limit highlights to top 10
    return highlights.slice(0, 10);
  }

  /**
   * Find original case version of matched token
   */
  private findOriginalMatch(line: string, token: string): string | null {
    const regex = new RegExp(`\\b${token}\\b`, 'i');
    const match = line.match(regex);
    return match ? match[0] : null;
  }

  /**
   * Tokenize text (simple word splitting)
   */
  private tokenize(text: string): string[] {
    return text
      .split(/\W+/)
      .filter(t => t.length > 0)
      .filter(t => !this.isStopWord(t));
  }

  /**
   * Check if word is stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'should', 'could', 'may', 'might', 'must', 'can',
    ]);

    return stopWords.has(word);
  }
}
