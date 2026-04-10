/**
 * Token Budget Planner
 *
 * Assembles context within a token budget to maximize relevance
 * while staying within LLM context limits.
 */

import type { MindChunk } from '@kb-labs/mind-types';

export interface TokenBudgetConfig {
  /** Total token budget for context */
  budget: number;
  /** Reserve tokens for the answer */
  reserveForAnswer: number;
  /** Max chunks from a single file */
  maxChunksPerFile: number;
  /** Prefer definition chunks over usages */
  preferDefinitions: boolean;
  /** Add neighboring context around high-scoring chunks */
  includeNeighbors: boolean;
  /** Neighbor context lines to include */
  neighborLines: number;
}

export interface AssembledContext {
  chunks: MindChunk[];
  tokensUsed: number;
  tokensAvailable: number;
  truncated: boolean;
  droppedChunks: number;
}

const DEFAULT_CONFIG: TokenBudgetConfig = {
  budget: 4000,
  reserveForAnswer: 1000,
  maxChunksPerFile: 3,
  preferDefinitions: true,
  includeNeighbors: false,
  neighborLines: 5,
};

// Approximate token count (rough estimate: 4 chars ≈ 1 token)
const CHARS_PER_TOKEN = 4;

/**
 * Token Budget Planner - assembles context within budget
 */
export class TokenBudgetPlanner {
  private readonly config: TokenBudgetConfig;

  constructor(config: Partial<TokenBudgetConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Assemble context from chunks within token budget
   */
  assemble(chunks: MindChunk[]): AssembledContext {
    const availableBudget = this.config.budget - this.config.reserveForAnswer;
    const selectedChunks: MindChunk[] = [];
    const fileChunkCounts = new Map<string, number>();
    let tokensUsed = 0;
    let droppedChunks = 0;

    // Sort chunks by score (should already be sorted, but ensure)
    const sortedChunks = [...chunks].sort((a, b) => b.score - a.score);

    // If preferDefinitions, boost definition chunks
    const rankedChunks = this.config.preferDefinitions
      ? this.boostDefinitions(sortedChunks)
      : sortedChunks;

    for (const chunk of rankedChunks) {
      // Check file limit
      const fileCount = fileChunkCounts.get(chunk.path) ?? 0;
      if (fileCount >= this.config.maxChunksPerFile) {
        droppedChunks++;
        continue;
      }

      // Estimate tokens for this chunk
      const chunkTokens = this.estimateTokens(chunk.text);

      // Check if fits in budget
      if (tokensUsed + chunkTokens > availableBudget) {
        // Try to truncate chunk to fit remaining budget
        const remainingBudget = availableBudget - tokensUsed;
        if (remainingBudget > 100) { // Only truncate if meaningful space left
          const truncatedChunk = this.truncateChunk(chunk, remainingBudget);
          if (truncatedChunk) {
            selectedChunks.push(truncatedChunk);
            tokensUsed += this.estimateTokens(truncatedChunk.text);
            fileChunkCounts.set(chunk.path, fileCount + 1);
          }
        }
        droppedChunks++;
        continue;
      }

      selectedChunks.push(chunk);
      tokensUsed += chunkTokens;
      fileChunkCounts.set(chunk.path, fileCount + 1);
    }

    return {
      chunks: selectedChunks,
      tokensUsed,
      tokensAvailable: availableBudget,
      truncated: droppedChunks > 0,
      droppedChunks,
    };
  }

  /**
   * Boost definition chunks higher in ranking
   */
  private boostDefinitions(chunks: MindChunk[]): MindChunk[] {
    return chunks
      .map(chunk => ({
        chunk,
        boostedScore: this.isDefinition(chunk) ? chunk.score * 1.2 : chunk.score,
      }))
      .sort((a, b) => b.boostedScore - a.boostedScore)
      .map(({ chunk }) => chunk);
  }

  /**
   * Check if chunk contains a definition (function, class, interface, etc.)
   */
  private isDefinition(chunk: MindChunk): boolean {
    const definitionPatterns = [
      /^export\s+(function|class|interface|type|const|enum)\s+/m,
      /^(function|class|interface|type)\s+\w+/m,
      /^(const|let|var)\s+\w+\s*=\s*(function|\(|async|\{)/m,
      /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*\w+\s*\([^)]*\)\s*[:{]/m,
    ];

    return definitionPatterns.some(pattern => pattern.test(chunk.text));
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Truncate chunk to fit within token budget
   */
  private truncateChunk(chunk: MindChunk, maxTokens: number): MindChunk | null {
    const maxChars = maxTokens * CHARS_PER_TOKEN;

    if (chunk.text.length <= maxChars) {
      return chunk;
    }

    // Try to truncate at a sensible boundary
    const truncatedText = this.smartTruncate(chunk.text, maxChars);

    if (truncatedText.length < 100) {
      return null; // Too short to be useful
    }

    return {
      ...chunk,
      text: truncatedText + '\n// ... truncated',
    };
  }

  /**
   * Smart truncation - cut at code boundaries when possible
   */
  private smartTruncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
      return text;
    }

    // Find last good boundary before maxChars
    const boundaries = [
      '\n\n',      // Double newline (paragraph)
      '\n}',       // End of block
      '\n',        // Any newline
      '. ',        // End of sentence
      ', ',        // Comma
      ' ',         // Space
    ];

    const truncated = text.slice(0, maxChars);

    for (const boundary of boundaries) {
      const lastIndex = truncated.lastIndexOf(boundary);
      if (lastIndex > maxChars * 0.5) { // Only if we keep at least half
        return truncated.slice(0, lastIndex + (boundary === '\n' ? 0 : 1));
      }
    }

    return truncated;
  }
}

/**
 * Format chunks for LLM with source numbers
 */
export function formatChunksWithNumbers(
  chunks: MindChunk[],
  maxLines = 50,
): string {
  return chunks
    .map((chunk, i) => {
      const lines = chunk.text.split('\n');
      const truncatedLines = lines.length > maxLines
        ? [...lines.slice(0, maxLines), '// ... truncated']
        : lines;

      return `[source:${i + 1}] ${chunk.path} (lines ${chunk.span.startLine}-${chunk.span.endLine}):\n\`\`\`\n${truncatedLines.join('\n')}\n\`\`\``;
    })
    .join('\n\n');
}

/**
 * Categorize chunks by source type for structured prompts
 */
export function categorizeChunks(chunks: MindChunk[]): {
  adrs: MindChunk[];
  code: MindChunk[];
  docs: MindChunk[];
  config: MindChunk[];
  other: MindChunk[];
} {
  const result = {
    adrs: [] as MindChunk[],
    code: [] as MindChunk[],
    docs: [] as MindChunk[],
    config: [] as MindChunk[],
    other: [] as MindChunk[],
  };

  for (const chunk of chunks) {
    const path = chunk.path.toLowerCase();

    if (path.includes('/adr/') || /adr-?\d+/i.test(path)) {
      result.adrs.push(chunk);
    } else if (/\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(path)) {
      result.code.push(chunk);
    } else if (path.endsWith('.md') || path.includes('/docs/')) {
      result.docs.push(chunk);
    } else if (/\.(json|yaml|yml|toml)$/.test(path) || path.includes('config')) {
      result.config.push(chunk);
    } else {
      result.other.push(chunk);
    }
  }

  return result;
}

export function createTokenBudgetPlanner(config?: Partial<TokenBudgetConfig>): TokenBudgetPlanner {
  return new TokenBudgetPlanner(config);
}
