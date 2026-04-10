/**
 * @module @kb-labs/mind-engine/reasoning/multi-hop-reasoner
 * Multi-hop reasoning with iterative context gathering
 *
 * Cheap AI identifies missing context → fetch → repeat → final reasoning
 */

import type { ILLM } from '@kb-labs/sdk';
import type { MindCandidate } from '@kb-labs/mind-types';

export interface MultiHopOptions {
  /**
   * Cheap AI for context gathering (GPT-4o-mini)
   */
  cheapAI: ILLM;

  /**
   * Expensive AI for final reasoning (Claude/GPT-o1)
   */
  expensiveAI: ILLM;

  /**
   * Maximum reasoning hops
   * Default: 3
   */
  maxHops?: number;

  /**
   * Confidence threshold to stop early
   * Default: 0.9
   */
  confidenceThreshold?: number;

  /**
   * Callback to fetch additional context
   */
  fetchContext: (queries: string[]) => Promise<MindCandidate[]>;
}

export interface ReasoningHop {
  hopNumber: number;
  query: string;
  results: MindCandidate[];
  analysis: string;
  missingContext: string[];
  confidence: number;
}

export interface MultiHopResult {
  hops: ReasoningHop[];
  finalContext: {
    summary: string;
    keyFindings: string[];
    codeSnippets: Array<{
      code: string;
      file: string;
      explanation: string;
    }>;
  };
  answer: string;
  confidence: number;
  tokensUsed: {
    cheap: number;
    expensive: number;
    total: number;
  };
}

/**
 * Multi-hop reasoner with iterative context gathering
 */
export class MultiHopReasoner {
  private readonly options: Required<Omit<MultiHopOptions, 'fetchContext'>> & {
    fetchContext: (queries: string[]) => Promise<MindCandidate[]>;
  };

  constructor(options: MultiHopOptions) {
    this.options = {
      cheapAI: options.cheapAI,
      expensiveAI: options.expensiveAI,
      maxHops: options.maxHops ?? 3,
      confidenceThreshold: options.confidenceThreshold ?? 0.9,
      fetchContext: options.fetchContext,
    };
  }

  /**
   * Execute multi-hop reasoning
   */
  async reason(
    originalQuery: string,
    initialResults: MindCandidate[],
  ): Promise<MultiHopResult> {
    const hops: ReasoningHop[] = [];
    let currentContext = initialResults;
    let cheapTokens = 0;
    let expensiveTokens = 0;

    // Hop 1: Analyze initial results
    let hop = await this.executeHop(1, originalQuery, currentContext);
    hops.push(hop);
    cheapTokens += this.estimateTokens(JSON.stringify(hop));

    // Additional hops if needed
    for (let i = 2; i <= this.options.maxHops && hop.confidence < this.options.confidenceThreshold; i++) {
      // Stop if no missing context identified
      if (hop.missingContext.length === 0) {
        break;
      }

      // Fetch additional context
      const additionalResults = await this.options.fetchContext(hop.missingContext);

      // Merge with existing context (deduplicate)
      currentContext = this.mergeContext(currentContext, additionalResults);

      // Execute next hop
      hop = await this.executeHop(i, originalQuery, currentContext);
      hops.push(hop);
      cheapTokens += this.estimateTokens(JSON.stringify(hop));
    }

    // Final reasoning with expensive AI
    const finalResult = await this.finalReasoning(originalQuery, hops, currentContext);
    expensiveTokens += this.estimateTokens(finalResult.answer);

    return {
      hops,
      finalContext: finalResult.context,
      answer: finalResult.answer,
      confidence: finalResult.confidence,
      tokensUsed: {
        cheap: cheapTokens,
        expensive: expensiveTokens,
        total: cheapTokens + expensiveTokens,
      },
    };
  }

  /**
   * Execute a single reasoning hop with cheap AI
   */
  private async executeHop(
    hopNumber: number,
    query: string,
    context: MindCandidate[],
  ): Promise<ReasoningHop> {
    const prompt = this.buildHopPrompt(hopNumber, query, context);

    const fullPrompt = `${HOP_SYSTEM_PROMPT}\n\n${prompt}`;
    const response = await this.options.cheapAI.complete(fullPrompt, {
      temperature: 0.2,
      maxTokens: 1000,
    });

    // Parse response
    const parsed = this.parseHopResponse(response.content);

    return {
      hopNumber,
      query,
      results: context,
      analysis: parsed.analysis,
      missingContext: parsed.missingContext,
      confidence: parsed.confidence,
    };
  }

  /**
   * Build prompt for reasoning hop
   */
  private buildHopPrompt(hopNumber: number, query: string, context: MindCandidate[]): string {
    let prompt = `# Reasoning Hop ${hopNumber}

## Original Query
${query}

## Current Context (${context.length} snippets)

`;

    // Show top 5 snippets
    const top5 = context.slice(0, 5);
    for (const [idx, c] of top5.entries()) {
      prompt += `### Snippet ${idx + 1}
**File:** ${c.context.file}
**Type:** ${c.context.type} ${c.context.name || ''}

\`\`\`
${c.snippet.code.slice(0, 500)}${c.snippet.code.length > 500 ? '...' : ''}
\`\`\`

`;
    }

    prompt += `
## Task

1. **Analyze** the current context
2. **Identify** what information is still missing to fully answer the query
3. **Rate** your confidence (0-1) in answering with current context

## Output Format (JSON)

\`\`\`json
{
  "analysis": "Brief analysis of current findings (2-3 sentences)",
  "missingContext": ["additional query 1", "additional query 2"],
  "confidence": 0.7
}
\`\`\`

If confidence >= 0.9, return empty missingContext array.
`;

    return prompt;
  }

  /**
   * Parse hop response
   */
  private parseHopResponse(response: string): {
    analysis: string;
    missingContext: string[];
    confidence: number;
  } {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? (jsonMatch[1] ?? response) : response;
      const parsed = JSON.parse(jsonStr);

      return {
        analysis: parsed.analysis || '',
        missingContext: parsed.missingContext || [],
        confidence: parsed.confidence || 0.5,
      };
    } catch {
      return {
        analysis: 'Unable to parse analysis',
        missingContext: [],
        confidence: 0.5,
      };
    }
  }

  /**
   * Final reasoning with expensive AI
   */
  private async finalReasoning(
    query: string,
    hops: ReasoningHop[],
    finalContext: MindCandidate[],
  ): Promise<{
    context: any;
    answer: string;
    confidence: number;
  }> {
    // Build comprehensive context summary
    const contextSummary = this.buildContextSummary(hops, finalContext);

    const prompt = `# Final Reasoning

## Original Query
${query}

## Context Gathered (${hops.length} hops)

${contextSummary}

## Task

Provide a comprehensive answer to the original query using the gathered context.

Format:
1. **Summary:** Brief overview
2. **Key Code:** Reference specific snippets
3. **Explanation:** How it works
4. **Usage:** Example usage if applicable

Be specific and cite file names/line numbers.
`;

    const systemPrompt = 'You are an expert code assistant. Provide clear, accurate answers based on the context provided.';
    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const response = await this.options.expensiveAI.complete(fullPrompt, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    return {
      context: {
        summary: hops[hops.length - 1]?.analysis || '',
        keyFindings: hops.map(h => h.analysis),
        codeSnippets: finalContext.slice(0, 5).map(c => ({
          code: c.snippet.code,
          file: c.context.file,
          explanation: `${c.context.type} ${c.context.name || ''} at lines ${c.snippet.lines[0]}-${c.snippet.lines[1]}`,
        })),
      },
      answer: response.content,
      confidence: hops[hops.length - 1]?.confidence || 0.5,
    };
  }

  /**
   * Build context summary from hops
   */
  private buildContextSummary(hops: ReasoningHop[], context: MindCandidate[]): string {
    let summary = '';

    for (const hop of hops) {
      summary += `### Hop ${hop.hopNumber} (Confidence: ${hop.confidence.toFixed(2)})
${hop.analysis}

`;
      if (hop.missingContext.length > 0) {
        summary += `**Additional queries:** ${hop.missingContext.join(', ')}\n\n`;
      }
    }

    summary += `\n### Final Context (${context.length} snippets)\n\n`;

    for (const [idx, c] of context.slice(0, 5).entries()) {
      summary += `**${idx + 1}. ${c.context.file}** (${c.context.type} ${c.context.name || ''})\n\`\`\`\n${c.snippet.code}\n\`\`\`\n\n`;
    }

    return summary;
  }

  /**
   * Merge and deduplicate context
   */
  private mergeContext(
    existing: MindCandidate[],
    additional: MindCandidate[],
  ): MindCandidate[] {
    const merged = [...existing];
    const existingIds = new Set(existing.map(c => c.context.file + c.context.relevantLines?.join('-')));

    for (const candidate of additional) {
      const id = candidate.context.file + candidate.context.relevantLines?.join('-');
      if (!existingIds.has(id)) {
        merged.push(candidate);
        existingIds.add(id);
      }
    }

    return merged;
  }

  /**
   * Estimate tokens
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

const HOP_SYSTEM_PROMPT = `You are an expert code analyst performing iterative context gathering.

Your goal: Analyze the current code context and identify what additional information is needed.

Be specific about missing context:
- ❌ "need more info about authentication"
- ✅ "need implementation of TokenService.validate method"

Output valid JSON only.`;
