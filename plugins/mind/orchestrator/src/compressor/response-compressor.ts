/**
 * Response Compressor
 *
 * Compresses agent responses to fit within token budget.
 */

import type { ILLM } from '@kb-labs/sdk';
import type { AgentResponse, AgentSource } from '../types';
import type { OrchestratorCompressionConfig } from '../types';

export interface ResponseCompressorOptions {
  llm?: ILLM;
  config: OrchestratorCompressionConfig;
}

/**
 * Estimate tokens in text (rough approximation)
 * ~4 characters per token for English/code
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Response Compressor - fits response within token budget
 */
export class ResponseCompressor {
  private readonly llm?: ILLM;
  private readonly config: OrchestratorCompressionConfig;

  constructor(options: ResponseCompressorOptions) {
    this.llm = options.llm;
    this.config = options.config;
  }

  /**
   * Compress response if needed
   */
  async compress(response: AgentResponse): Promise<AgentResponse> {
    const responseJson = JSON.stringify(response);
    const currentTokens = estimateTokens(responseJson);

    // Already within budget
    if (currentTokens <= this.config.maxResponseTokens) {
      return response;
    }

    // Apply compression based on strategy
    switch (this.config.compressionStrategy) {
      case 'truncate':
        return this.truncateResponse(response);
      case 'summarize':
        return this.summarizeResponse(response);
      case 'smart':
      default:
        return this.smartCompress(response, currentTokens);
    }
  }

  /**
   * Smart compression - adaptive strategy
   */
  private async smartCompress(response: AgentResponse, currentTokens: number): Promise<AgentResponse> {
    const budget = this.config.maxResponseTokens;
    const overBy = currentTokens - budget;

    // Small overflow - just truncate snippets
    if (overBy < budget * 0.2) {
      return this.truncateResponse(response);
    }

    // Medium overflow - reduce sources + truncate
    if (overBy < budget * 0.5) {
      const reduced = this.reduceSourceCount(response);
      return this.truncateResponse(reduced);
    }

    // Large overflow - summarize if LLM available, otherwise aggressive truncate
    if (this.llm) {
      return this.summarizeResponse(response);
    }
    return this.aggressiveTruncate(response);
  }

  /**
   * Truncate snippets in sources
   */
  private truncateResponse(response: AgentResponse): AgentResponse {
    const truncatedSources = response.sources.map(source => ({
      ...source,
      snippet: this.truncateSnippet(source.snippet ?? '', this.config.maxSnippetLines),
    }));

    const result: AgentResponse = {
      ...response,
      sources: truncatedSources,
    };

    // Add debug info about compression
    if (response.debug) {
      result.debug = {
        ...response.debug,
        compressionApplied: true,
      };
    }

    return result;
  }

  /**
   * Reduce number of sources
   */
  private reduceSourceCount(response: AgentResponse): AgentResponse {
    const maxSources = Math.min(this.config.maxSources, response.sources.length);
    return {
      ...response,
      sources: response.sources.slice(0, maxSources),
    };
  }

  /**
   * Aggressive truncation for large responses
   */
  private aggressiveTruncate(response: AgentResponse): AgentResponse {
    // Keep only 3 sources with very short snippets
    const truncatedSources = response.sources
      .slice(0, 3)
      .map(source => ({
        ...source,
        snippet: this.truncateSnippet(source.snippet ?? '', 5),
      }));

    // Truncate answer if very long
    const maxAnswerLength = 500;
    const answer = response.answer.length > maxAnswerLength
      ? response.answer.slice(0, maxAnswerLength) + '...'
      : response.answer;

    return {
      ...response,
      answer,
      sources: truncatedSources,
      debug: response.debug ? {
        ...response.debug,
        compressionApplied: true,
      } : undefined,
    };
  }

  /**
   * Summarize using LLM
   */
  private async summarizeResponse(response: AgentResponse): Promise<AgentResponse> {
    if (!this.llm) {
      return this.aggressiveTruncate(response);
    }

    try {
      // Summarize each snippet
      const summarizedSources: AgentSource[] = [];

      for (const source of response.sources.slice(0, this.config.maxSources)) {
        if ((source.snippet ?? '').length > 200) {
          const summary = await this.summarizeSnippet(source.snippet ?? '');
          summarizedSources.push({
            ...source,
            snippet: summary,
          });
        } else {
          summarizedSources.push(source);
        }
      }

      return {
        ...response,
        sources: summarizedSources,
        debug: response.debug ? {
          ...response.debug,
          compressionApplied: true,
        } : undefined,
      };
    } catch {
      return this.aggressiveTruncate(response);
    }
  }

  /**
   * Summarize a code snippet using LLM
   */
  private async summarizeSnippet(snippet: string): Promise<string> {
    if (!this.llm) {return this.truncateSnippet(snippet, 10);}

    const prompt = `Summarize this code snippet in 3-5 lines, preserving the most important parts:

\`\`\`
${snippet}
\`\`\`

Return only the summarized code, no explanation.`;

    const response = await this.llm.complete(prompt, {
      maxTokens: 200,
      temperature: 0.1,
    });

    return response.content.trim();
  }

  /**
   * Truncate snippet to max lines
   */
  private truncateSnippet(text: string, maxLines: number): string {
    const lines = text.split('\n');
    if (lines.length <= maxLines) {
      return text;
    }
    return lines.slice(0, maxLines).join('\n') + '\n// ...';
  }
}

export function createResponseCompressor(options: ResponseCompressorOptions): ResponseCompressor {
  return new ResponseCompressor(options);
}
