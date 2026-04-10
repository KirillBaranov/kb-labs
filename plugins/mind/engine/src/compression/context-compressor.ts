/**
 * @module @kb-labs/mind-engine/compression/context-compressor
 * Two-tier AI context compression
 *
 * Uses cheap AI (GPT-4o-mini) to compress search results into
 * dense context package for expensive AI (Claude/GPT-o1).
 */

import type { MindCandidate } from '@kb-labs/mind-types';
import type { ILLM } from '@kb-labs/sdk';

export interface ContextCompressionOptions {
  /**
   * LLM engine for compression (GPT-4o-mini recommended)
   */
  llmEngine: ILLM;

  /**
   * Target compression ratio (0-1)
   * 0.2 = compress to 20% of original size
   * Default: 0.25 (4x compression)
   */
  compressionRatio?: number;

  /**
   * Maximum output tokens
   * Default: 2000
   */
  maxOutputTokens?: number;

  /**
   * Include code structure in compression
   * Default: true
   */
  includeStructure?: boolean;

  /**
   * Include cross-references between results
   * Default: true
   */
  includeCrossReferences?: boolean;

  /**
   * LLM temperature
   * Default: 0.1 (deterministic)
   */
  temperature?: number;
}

export interface CompressedContext {
  /**
   * Compressed summary of all results
   */
  summary: string;

  /**
   * Key code snippets (already filtered and ranked)
   */
  keySnippets: Array<{
    code: string;
    file: string;
    purpose: string;  // What this code does
    relevance: number; // Relevance score
  }>;

  /**
   * Code structure overview
   */
  structure?: {
    mainEntities: string[];      // Main classes/functions
    dependencies: string[];       // Key dependencies
    patterns: string[];           // Design patterns used
  };

  /**
   * Cross-references between snippets
   */
  crossReferences?: Array<{
    from: string;  // File/function
    to: string;    // File/function
    type: 'calls' | 'imports' | 'extends' | 'implements';
  }>;

  /**
   * Metadata
   */
  metadata: {
    originalTokens: number;
    compressedTokens: number;
    compressionRatio: number;
    candidatesProcessed: number;
    candidatesKept: number;
  };
}

/**
 * Context compressor using cheap AI
 */
export class ContextCompressor {
  private readonly options: Required<ContextCompressionOptions>;

  constructor(options: ContextCompressionOptions) {
    this.options = {
      llmEngine: options.llmEngine,
      compressionRatio: options.compressionRatio ?? 0.25,
      maxOutputTokens: options.maxOutputTokens ?? 2000,
      includeStructure: options.includeStructure ?? true,
      includeCrossReferences: options.includeCrossReferences ?? true,
      temperature: options.temperature ?? 0.1,
    };
  }

  /**
   * Compress search results into dense context
   */
  async compress(
    query: string,
    candidates: MindCandidate[],
  ): Promise<CompressedContext> {
    if (candidates.length === 0) {
      return this.emptyContext();
    }

    // Calculate original token count
    const originalTokens = this.estimateTokens(
      candidates.map(c => c.snippet.code).join('\n\n')
    );

    // Build compression prompt
    const prompt = this.buildCompressionPrompt(query, candidates);

    // Call cheap AI (GPT-4o-mini)
    const fullPrompt = `${COMPRESSION_SYSTEM_PROMPT}\n\n${prompt}`;
    const response = await this.options.llmEngine.complete(fullPrompt, {
      temperature: this.options.temperature,
      maxTokens: this.options.maxOutputTokens,
    });

    // Parse structured response
    const compressed = this.parseCompressionResponse(response.content, candidates);

    // Calculate compression metrics
    const compressedTokens = this.estimateTokens(JSON.stringify(compressed));

    compressed.metadata = {
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
      candidatesProcessed: candidates.length,
      candidatesKept: compressed.keySnippets.length,
    };

    return compressed;
  }

  /**
   * Build compression prompt for cheap AI
   */
  private buildCompressionPrompt(query: string, candidates: MindCandidate[]): string {
    let prompt = `# Task: Compress Search Results for Efficient AI Reasoning

## User Query
${query}

## Search Results (${candidates.length} candidates)

`;

    // Add top candidates with context
    const topCandidates = candidates.slice(0, 10); // Process top 10
    for (const [idx, candidate] of topCandidates.entries()) {
      prompt += `### Result ${idx + 1} (Score: ${candidate.score.toFixed(3)})
**File:** ${candidate.context.file}
**Type:** ${candidate.context.type}
**Name:** ${candidate.context.name || 'N/A'}
**Lines:** ${candidate.snippet.lines[0]}-${candidate.snippet.lines[1]}

\`\`\`${candidate.context.language || 'typescript'}
${candidate.snippet.code}
\`\`\`

`;

      if (candidate.snippet.highlights && candidate.snippet.highlights.length > 0) {
        prompt += `**Highlights:** ${candidate.snippet.highlights.map(h => h.text).join(', ')}\n\n`;
      }
    }

    prompt += `
## Instructions

1. **Filter Results:** Keep only 3-5 most relevant snippets that directly answer the query
2. **Extract Purpose:** For each snippet, explain in 1 sentence what it does
3. **Find Structure:** Identify main classes, functions, and design patterns
4. **Find Cross-References:** Identify relationships (calls, imports, inheritance)

## Output Format (JSON)

\`\`\`json
{
  "summary": "1-2 sentence overview of findings",
  "keySnippets": [
    {
      "code": "the actual code snippet",
      "file": "path/to/file.ts",
      "purpose": "1 sentence explaining what this does",
      "relevance": 0.95
    }
  ],
  "structure": {
    "mainEntities": ["ClassName", "functionName"],
    "dependencies": ["@package/name"],
    "patterns": ["Singleton", "Factory"]
  },
  "crossReferences": [
    {
      "from": "UserService.authenticate",
      "to": "TokenService.generate",
      "type": "calls"
    }
  ]
}
\`\`\`

Focus on brevity and relevance. Remove redundant code. Keep only what's needed for reasoning.
`;

    return prompt;
  }

  /**
   * Parse LLM response into structured format
   */
  private parseCompressionResponse(
    response: string,
    candidates: MindCandidate[],
  ): CompressedContext {
    try {
      // Extract JSON from response (may have markdown code blocks)
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) ||
                       response.match(/```\n([\s\S]*?)\n```/);

      const jsonStr = jsonMatch ? (jsonMatch[1] ?? response) : response;
      const parsed = JSON.parse(jsonStr);

      return {
        summary: parsed.summary || '',
        keySnippets: parsed.keySnippets || [],
        structure: this.options.includeStructure ? parsed.structure : undefined,
        crossReferences: this.options.includeCrossReferences ? parsed.crossReferences : undefined,
        metadata: {
          originalTokens: 0,
          compressedTokens: 0,
          compressionRatio: 0,
          candidatesProcessed: candidates.length,
          candidatesKept: parsed.keySnippets?.length || 0,
        },
      };
    } catch (error) {
      // Fallback: return top 3 candidates as-is
      return this.fallbackCompression(candidates);
    }
  }

  /**
   * Fallback compression (no LLM)
   */
  private fallbackCompression(candidates: MindCandidate[]): CompressedContext {
    const top3 = candidates.slice(0, 3);

    return {
      summary: `Found ${candidates.length} results. Top ${top3.length} most relevant snippets:`,
      keySnippets: top3.map(c => ({
        code: c.snippet.code,
        file: c.context.file,
        purpose: `${c.context.type} ${c.context.name || ''} in ${c.context.file}`,
        relevance: c.score,
      })),
      metadata: {
        originalTokens: 0,
        compressedTokens: 0,
        compressionRatio: 1,
        candidatesProcessed: candidates.length,
        candidatesKept: top3.length,
      },
    };
  }

  /**
   * Empty context for no results
   */
  private emptyContext(): CompressedContext {
    return {
      summary: 'No relevant results found.',
      keySnippets: [],
      metadata: {
        originalTokens: 0,
        compressedTokens: 0,
        compressionRatio: 0,
        candidatesProcessed: 0,
        candidatesKept: 0,
      },
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters for code
    return Math.ceil(text.length / 4);
  }
}

/**
 * System prompt for compression AI
 */
const COMPRESSION_SYSTEM_PROMPT = `You are an expert code analysis assistant specialized in compressing search results.

Your goal: Extract only the most relevant information and present it in a compact, structured format.

Key principles:
1. **Brevity**: Remove redundant code, keep only essential parts
2. **Relevance**: Focus on code that directly answers the query
3. **Structure**: Organize information for easy reasoning
4. **Cross-references**: Identify relationships between code snippets

Output valid JSON only. No explanations outside the JSON structure.`;
