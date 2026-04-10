/**
 * Token estimation utilities for KB Labs Mind
 */

import type { ITokenEstimator } from "../types/pack";

/**
 * Default whitespace-aware token estimator
 * Algorithm: ~3.8-4.2 chars/token based on whitespace and code patterns
 */
export class DefaultTokenEstimator implements ITokenEstimator {
  private readonly charsPerToken: number = 4.0;
  private readonly codeBonus: number = 0.1; // 10% bonus for code-like content
  private readonly punctuationWeight: number = 0.8;

  estimate(text: string): number {
    if (!text || text.length === 0) {return 0;}

    // Count words, punctuation, and whitespace
    const words = text.match(/\b\w+\b/g) || [];
    const punctuation = text.match(/[^\w\s]/g) || [];
    const whitespace = text.match(/\s/g) || [];
    
    // Base estimation
    let tokens = words.length;
    
    // Add punctuation with weight
    tokens += punctuation.length * this.punctuationWeight;
    
    // Add whitespace (spaces, newlines, tabs)
    tokens += whitespace.length * 0.3;
    
    // Apply code bonus if content looks like code
    const codeIndicators = text.match(/[{}();=<>]/g) || [];
    if (codeIndicators.length > words.length * 0.1) {
      tokens *= (1 + this.codeBonus);
    }
    
    // Apply character-based adjustment
    const charBasedEstimate = text.length / this.charsPerToken;
    
    // Use the higher of word-based or char-based estimate
    return Math.ceil(Math.max(tokens, charBasedEstimate));
  }

  truncate(text: string, maxTokens: number, mode: "start"|"middle"|"end"): string {
    if (this.estimate(text) <= maxTokens) {
      return text;
    }

    const lines = text.split('\n');
    const estimatedTokens = this.estimate(text);
    const ratio = maxTokens / estimatedTokens;
    const targetLines = Math.max(1, Math.floor(lines.length * ratio));
    
    if (targetLines >= lines.length) {return text;}

    switch (mode) {
      case 'start':
        return lines.slice(0, targetLines).join('\n');
      case 'end':
        return lines.slice(-targetLines).join('\n');
      case 'middle':
      default: {
        const startLines = Math.max(1, Math.floor(targetLines / 2));
        const endLines = Math.max(1, targetLines - startLines);
        const start = lines.slice(0, startLines);
        const end = lines.slice(-endLines);
        return [...start, '...', ...end].join('\n');
      }
    }
  }
}

/**
 * Default token estimator instance
 */
export const defaultTokenEstimator = new DefaultTokenEstimator();

/**
 * Estimate tokens using default strategy
 */
export function estimateTokens(text: string): number {
  return defaultTokenEstimator.estimate(text);
}

/**
 * Truncate text to token limit using default strategy
 */
export function truncateToTokens(
  text: string, 
  maxTokens: number, 
  mode: "start"|"middle"|"end" = "middle"
): string {
  return defaultTokenEstimator.truncate(text, maxTokens, mode);
}
