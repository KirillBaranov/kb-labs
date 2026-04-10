/**
 * Source Verifier
 *
 * Verifies that sources cited in responses actually exist
 * and contain the claimed content. Key anti-hallucination layer.
 */

import type { AgentSource, AgentWarning } from '../types';
import type { MindChunk } from '@kb-labs/mind-types';

export interface SourceVerificationResult {
  source: AgentSource;
  exists: boolean;
  snippetFound: boolean;
  linesValid: boolean;
  confidence: number;
}

export interface VerificationSummary {
  totalSources: number;
  verified: number;
  failed: number;
  warnings: AgentWarning[];
  adjustedConfidence: number;
}

export interface SourceVerifierOptions {
  /** Minimum snippet overlap to consider valid (0-1) */
  minSnippetOverlap?: number;
  /** Allow fuzzy line matching within N lines */
  lineMatchTolerance?: number;
  /** Skip verification for external sources */
  skipExternal?: boolean;
}

const DEFAULT_OPTIONS: Required<SourceVerifierOptions> = {
  minSnippetOverlap: 0.5,
  lineMatchTolerance: 5,
  skipExternal: true,
};

/**
 * Source Verifier - validates that LLM-generated sources are real
 */
export class SourceVerifier {
  private readonly options: Required<SourceVerifierOptions>;

  constructor(options: SourceVerifierOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Verify all sources against retrieved chunks
   */
  verifyAll(
    sources: AgentSource[],
    chunks: MindChunk[],
    baseConfidence: number,
  ): VerificationSummary {
    const results: SourceVerificationResult[] = [];
    const warnings: AgentWarning[] = [];

    for (const source of sources) {
      // Skip external sources if configured
      if (this.options.skipExternal && source.kind === 'external') {
        results.push({
          source,
          exists: true,
          snippetFound: true,
          linesValid: true,
          confidence: 1,
        });
        continue;
      }

      const result = this.verifySource(source, chunks);
      results.push(result);

      // Generate warnings for failed verifications
      if (!result.exists) {
        warnings.push({
          code: 'UNVERIFIED_SOURCE',
          message: `Source file not found in retrieved chunks: ${source.file}`,
          details: { file: source.file },
        });
      } else if (!result.snippetFound) {
        warnings.push({
          code: 'UNVERIFIED_SOURCE',
          message: `Snippet not found in source file: ${source.file}`,
          details: { file: source.file },
        });
      }
    }

    // Calculate verification score with partial credit
    // - File exists = 0.7 base
    // - Snippet found = +0.3
    // This avoids zero confidence when LLM slightly modifies snippets
    let totalScore = 0;
    for (const result of results) {
      if (result.exists) {
        totalScore += 0.7; // File exists - partial credit
        if (result.snippetFound) {
          totalScore += 0.3; // Snippet verified - full credit
        }
      }
    }

    const verified = results.filter(r => r.exists && r.snippetFound).length;
    const partiallyVerified = results.filter(r => r.exists && !r.snippetFound).length;
    const failed = results.length - verified - partiallyVerified;

    // Adjust confidence based on verification results
    // Use average score instead of strict verification rate
    const verificationRate = results.length > 0 ? totalScore / results.length : 1;
    const adjustedConfidence = baseConfidence * verificationRate;

    return {
      totalSources: sources.length,
      verified,
      failed,
      warnings,
      adjustedConfidence,
    };
  }

  /**
   * Verify a single source against chunks
   */
  verifySource(source: AgentSource, chunks: MindChunk[]): SourceVerificationResult {
    // Find matching chunk by file path
    const matchingChunks = chunks.filter(chunk =>
      this.pathMatches(chunk.path, source.file)
    );

    if (matchingChunks.length === 0) {
      return {
        source,
        exists: false,
        snippetFound: false,
        linesValid: false,
        confidence: 0,
      };
    }

    // Check if snippet content exists in any matching chunk
    const snippetFound = this.verifySnippet(source.snippet, matchingChunks);

    // Check if line numbers are reasonable
    const linesValid = this.verifyLines(source.lines, matchingChunks);

    // Calculate confidence
    const confidence = this.calculateConfidence(snippetFound, linesValid);

    return {
      source,
      exists: true,
      snippetFound,
      linesValid,
      confidence,
    };
  }

  /**
   * Check if paths match (handles relative/absolute differences)
   */
  private pathMatches(chunkPath: string, sourcePath: string): boolean {
    // Normalize paths
    const normalizedChunk = this.normalizePath(chunkPath);
    const normalizedSource = this.normalizePath(sourcePath);

    // Exact match
    if (normalizedChunk === normalizedSource) {
      return true;
    }

    // One ends with the other (relative vs absolute)
    if (normalizedChunk.endsWith(normalizedSource) || normalizedSource.endsWith(normalizedChunk)) {
      return true;
    }

    return false;
  }

  /**
   * Normalize path for comparison
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .toLowerCase();
  }

  /**
   * Verify snippet exists in chunks
   */
  private verifySnippet(snippet: string | undefined, chunks: MindChunk[]): boolean {
    if (!snippet || snippet.trim().length === 0) {
      return true; // Empty snippet is valid
    }

    const normalizedSnippet = this.normalizeCode(snippet);
    const snippetLines = normalizedSnippet.split('\n').filter(l => l.trim().length > 0);

    for (const chunk of chunks) {
      const normalizedChunk = this.normalizeCode(chunk.text);

      // Check for exact substring match
      if (normalizedChunk.includes(normalizedSnippet)) {
        return true;
      }

      // Check for partial line matches
      const chunkLines = normalizedChunk.split('\n');
      const matchingLines = snippetLines.filter(snippetLine =>
        chunkLines.some(chunkLine => chunkLine.includes(snippetLine.trim()))
      );

      const overlap = matchingLines.length / snippetLines.length;
      if (overlap >= this.options.minSnippetOverlap) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize code for comparison
   */
  private normalizeCode(code: string): string {
    return code
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, '  ')
      .replace(/\s+$/gm, '') // trailing whitespace
      .toLowerCase();
  }

  /**
   * Verify line numbers are reasonable
   */
  private verifyLines(lines: [number, number] | undefined, chunks: MindChunk[]): boolean {
    if (!lines) {
      return true; // Missing line range is acceptable
    }
    const [start, end] = lines;

    // Invalid line numbers
    if (start <= 0 || end <= 0 || start > end) {
      return false;
    }

    // Check if any chunk covers these lines (with tolerance)
    for (const chunk of chunks) {
      const chunkStart = chunk.span.startLine;
      const chunkEnd = chunk.span.endLine;

      // Check overlap with tolerance
      const tolerance = this.options.lineMatchTolerance;
      const overlaps =
        start <= chunkEnd + tolerance &&
        end >= chunkStart - tolerance;

      if (overlaps) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate verification confidence
   */
  private calculateConfidence(snippetFound: boolean, linesValid: boolean): number {
    if (snippetFound && linesValid) {
      return 1.0;
    }
    if (snippetFound || linesValid) {
      return 0.7;
    }
    return 0.3;
  }
}

/**
 * Extract file/function mentions from answer text
 */
export function extractCodeMentions(answer: string): string[] {
  const mentions: string[] = [];

  // File paths: path/to/file.ts, ./file.js, etc
  const filePaths = answer.match(/(?:[\w./\\-]+\/)?[\w-]+\.\w{2,4}/g) ?? [];
  mentions.push(...filePaths);

  // Function/class names in backticks: `functionName`, `ClassName`
  const backtickRefs = answer.match(/`(\w+)`/g)?.map(m => m.slice(1, -1)) ?? [];
  mentions.push(...backtickRefs);

  // CamelCase identifiers (likely class/function names)
  const camelCase = answer.match(/\b[A-Z][a-z]+[A-Z]\w*\b/g) ?? [];
  mentions.push(...camelCase);

  return [...new Set(mentions)];
}

/**
 * Verify that code mentions in the answer exist in chunks
 */
export function verifyMentionsInChunks(
  mentions: string[],
  chunks: MindChunk[],
): { verified: string[]; unverified: string[] } {
  const verified: string[] = [];
  const unverified: string[] = [];

  const allChunkText = chunks.map(c => c.text.toLowerCase()).join('\n');
  const allPaths = chunks.map(c => c.path.toLowerCase()).join('\n');

  for (const mention of mentions) {
    const lowerMention = mention.toLowerCase();

    // Check in chunk text or paths
    if (allChunkText.includes(lowerMention) || allPaths.includes(lowerMention)) {
      verified.push(mention);
    } else {
      unverified.push(mention);
    }
  }

  return { verified, unverified };
}

export function createSourceVerifier(options?: SourceVerifierOptions): SourceVerifier {
  return new SourceVerifier(options);
}
