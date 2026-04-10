import type { ILLM } from '@kb-labs/sdk';
import type { ComplexityResult } from './types';

export interface ComplexityDetectorOptions {
  /**
   * Complexity threshold above which reasoning is recommended
   * Default: 0.6
   */
  threshold?: number;
  
  /**
   * Enable heuristic-based detection
   * Default: true
   */
  heuristics?: boolean;
  
  /**
   * Enable LLM-based detection
   * Default: false
   */
  llmBased?: boolean;
  
  /**
   * LLM model for complexity detection
   */
  llmModel?: string;
}

export class ComplexityDetector {
  private readonly threshold: number;
  private readonly useHeuristics: boolean;
  private readonly useLLM: boolean;
  private readonly llmEngine: ILLM | null;
  private readonly llmModel: string;

  constructor(
    options: ComplexityDetectorOptions,
    llmEngine: ILLM | null,
  ) {
    this.threshold = options.threshold ?? 0.6;
    this.useHeuristics = options.heuristics ?? true;
    this.useLLM = options.llmBased ?? false;
    this.llmEngine = llmEngine;
    this.llmModel = options.llmModel ?? 'gpt-4o-mini';
  }

  /**
   * Detect query complexity and determine if reasoning is needed
   * 
   * Strategy:
   * 1. Try LLM-based detection first (if enabled and available) - language-agnostic
   * 2. Fallback to heuristics if LLM fails or is disabled
   * 
   * This approach is future-proof for:
   * - Any language (not just English/Russian)
   * - Local LLM models (Ollama, etc.)
   * - Better semantic understanding vs keyword matching
   */
  async detectComplexity(queryText: string): Promise<ComplexityResult> {
    const reasons: string[] = [];

    // Primary: LLM-based detection (language-agnostic, semantic)
    if (this.useLLM && this.llmEngine) {
      try {
        const llmResult = await this.llmComplexity(queryText);
        if (llmResult.score > 0) {
          return {
            score: Math.min(1, Math.max(0, llmResult.score)),
            reasons: [
              `LLM assessed complexity: ${(llmResult.score * 100).toFixed(0)}%`,
              ...llmResult.reasons,
            ],
            needsReasoning: llmResult.score >= this.threshold,
          };
        }
        // If LLM returned 0, fall through to heuristics
        reasons.push('LLM returned low complexity, checking heuristics');
      } catch (error) {
        // LLM failed, fallback to heuristics
        reasons.push(`LLM complexity detection failed: ${error instanceof Error ? error.message : String(error)}, falling back to heuristics`);
      }
    }

    // Fallback: Heuristic-based detection (for when LLM is unavailable)
    if (this.useHeuristics) {
      const heuristic = this.heuristicComplexity(queryText);
      return {
        score: Math.min(1, Math.max(0, heuristic.score)),
        reasons: [
          ...reasons,
          ...heuristic.reasons,
          ...(reasons.length > 0 ? [] : ['Using heuristic-based detection (LLM not available)']),
        ],
        needsReasoning: heuristic.score >= this.threshold,
      };
    }

    // If both are disabled, return default
    return {
      score: 0.5,
      reasons: ['Both LLM and heuristic detection disabled, defaulting to moderate complexity'],
      needsReasoning: false,
    };
  }

  /**
   * Heuristic-based complexity detection
   */
  private heuristicComplexity(queryText: string): { score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 0;

    const text = queryText.toLowerCase().trim();
    const length = text.length;
    const words = text.split(/\s+/).length;

    // Length-based complexity (более чувствительные пороги)
    if (length > 150) {
      score += 0.25;
      reasons.push('Long query (>150 chars)');
    } else if (length > 80) {
      score += 0.15;
      reasons.push('Medium-length query (>80 chars)');
    } else if (length > 40) {
      score += 0.08;
      reasons.push('Short-medium query (>40 chars)');
    }

    // Word count complexity (более чувствительные пороги)
    if (words > 15) {
      score += 0.2;
      reasons.push('High word count (>15 words)');
    } else if (words > 8) {
      score += 0.12;
      reasons.push('Medium word count (>8 words)');
    } else if (words > 5) {
      score += 0.06;
      reasons.push('Low-medium word count (>5 words)');
    }

    // Multi-concept indicators (расширенный список)
    const multiConceptKeywords = [
      'and', 'или', 'also', 'также', 'plus', 'плюс',
      'compare', 'сравнить', 'difference', 'разница', 'versus', 'против',
      'how', 'как', 'why', 'почему', 'what', 'что', 'where', 'где',
      'implement', 'реализовать', 'example', 'пример', 'explain', 'объяснить',
      'architecture', 'архитектура', 'design', 'дизайн', 'structure', 'структура',
      'work', 'работать', 'function', 'функция', 'process', 'процесс',
      'include', 'включать', 'consist', 'состоять', 'contain', 'содержать',
    ];
    const conceptCount = multiConceptKeywords.filter(kw => text.includes(kw)).length;
    if (conceptCount >= 3) {
      score += 0.3;
      reasons.push(`Multiple concepts detected (${conceptCount} indicators)`);
    } else if (conceptCount >= 2) {
      score += 0.18;
      reasons.push(`Several concepts detected (${conceptCount} indicators)`);
    } else if (conceptCount === 1) {
      score += 0.08;
      reasons.push(`Single concept indicator detected`);
    }

    // Question complexity (расширенный список)
    const questionWords = ['how', 'why', 'what', 'when', 'where', 'which', 'who', 
                          'как', 'почему', 'что', 'когда', 'где', 'какой', 'кто'];
    const questionCount = questionWords.filter(qw => text.includes(qw)).length;
    if (questionCount >= 2) {
      score += 0.25;
      reasons.push(`Multiple questions (${questionCount})`);
    } else if (questionCount === 1) {
      score += 0.12;
      reasons.push('Question detected');
    }

    // Technical complexity indicators
    const technicalPatterns = [
      /\b(?:implement|реализовать|create|создать|build|построить)\b/,
      /\b(?:explain|объяснить|describe|описать|show|показать)\b/,
      /\b(?:example|пример|code|код|function|функция)\b/,
      /\b(?:architecture|архитектура|design|дизайн|pattern|паттерн)\b/,
    ];
    const technicalMatches = technicalPatterns.filter(pattern => pattern.test(text)).length;
    if (technicalMatches >= 3) {
      score += 0.15;
      reasons.push(`High technical complexity (${technicalMatches} patterns)`);
    }

    // Code-related queries are typically more complex
    if (/\b(?:code|код|function|функция|class|класс|interface|интерфейс|type|тип)\b/.test(text)) {
      score += 0.1;
      reasons.push('Code-related query');
    }

    return {
      score: Math.min(1, score),
      reasons,
    };
  }

  /**
   * LLM-based complexity detection
   * 
   * Uses LLM to semantically analyze query complexity.
   * Language-agnostic and works with any language.
   * 
   * Future: Supports local LLM models (Ollama, etc.) via platform ILLM interface.
   * The engine abstraction allows switching between OpenAI, local models, or any
   * LLM provider without changing this code.
   * 
   * Returns structured result with score and reasoning.
   */
  private async llmComplexity(queryText: string): Promise<{ score: number; reasons: string[] }> {
    if (!this.llmEngine) {
      return { score: 0, reasons: [] };
    }

    // Use structured prompt that works with any language
    const prompt = `Analyze the complexity of this query to determine if it requires multi-step reasoning.

Query: "${queryText}"

Consider:
- Does it ask about multiple concepts or topics?
- Does it require connecting information from different parts of the codebase?
- Does it need explanation of relationships or interactions?
- Is it a simple lookup or does it need synthesis?

Respond with a JSON object:
{
  "score": <number between 0.0 and 1.0>,
  "reason": "<brief explanation in English>"
}

Where:
- 0.0-0.3: Simple, single-concept query (e.g., "where is function X?")
- 0.4-0.6: Moderate complexity, multiple concepts (e.g., "how does X work with Y?")
- 0.7-1.0: High complexity, requires multi-step reasoning (e.g., "explain architecture of X and how it integrates with Y and Z")

Respond ONLY with valid JSON, no other text.`;

    try {
      const result = await this.llmEngine.complete(prompt, {
        temperature: 0.2, // Low temperature for consistent scoring
        maxTokens: 150,
      });
      const response = result.content;

      // Try to parse JSON response
      const cleaned = response.trim();
      let parsed: { score?: number; reason?: string } | undefined;

      // Try to extract JSON from response (in case LLM adds extra text)
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          // If JSON parsing fails, try to extract score as number
          const scoreMatch = cleaned.match(/["']?score["']?\s*:\s*([0-9.]+)/);
          if (scoreMatch && scoreMatch[1]) {
            parsed = { score: parseFloat(scoreMatch[1]) };
          }
        }
      } else {
        // Fallback: try to parse as plain number
        const numMatch = cleaned.match(/[0-9]+\.[0-9]+|[0-9]+/);
        if (numMatch && numMatch[0]) {
          parsed = { score: parseFloat(numMatch[0]) };
        }
      }

      const score = parsed?.score;
      if (score !== undefined && !isNaN(score) && score >= 0 && score <= 1 && parsed) {
        return {
          score: Math.min(1, Math.max(0, score)),
          reasons: parsed.reason ? [parsed.reason] : [`LLM complexity score: ${(score * 100).toFixed(0)}%`],
        };
      }

      // If parsing failed, return moderate score
      return {
        score: 0.5,
        reasons: ['LLM response parsing failed, defaulting to moderate complexity'],
      };
    } catch (error) {
      // If LLM call fails, return 0 to trigger fallback
      return {
        score: 0,
        reasons: [`LLM call failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }
}
