/**
 * @module @kb-labs/rest-api-app/services/incident-analyzer
 * AI-powered incident analysis using LLM
 */

import type { Incident } from './incident-storage';
import { platform } from '@kb-labs/core-runtime';

/**
 * AI analysis result structure
 */
export interface IncidentAnalysis {
  /** Executive summary of the incident */
  summary: string;
  /** Identified root causes with confidence scores */
  rootCauses: Array<{
    factor: string;
    confidence: number;
    evidence: string;
  }>;
  /** Detected patterns or trends */
  patterns: string[];
  /** Actionable recommendations */
  recommendations: string[];
  /** Analysis timestamp */
  analyzedAt: number;
}

/**
 * Incident analyzer configuration
 */
export interface IncidentAnalyzerConfig {
  /** LLM model to use (default: gpt-4) */
  model?: string;
  /** Temperature for generation (default: 0.3 for consistency) */
  temperature?: number;
  /** Max tokens for response (default: 1500) */
  maxTokens?: number;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<IncidentAnalyzerConfig> = {
  model: 'gpt-4',
  temperature: 0.3,
  maxTokens: 1500,
  debug: false,
};

/**
 * AI-powered incident analyzer
 *
 * Analyzes incidents using LLM to:
 * - Identify root causes from logs and metrics
 * - Detect patterns across timeline
 * - Generate actionable recommendations
 */
export class IncidentAnalyzer {
  private config: Required<IncidentAnalyzerConfig>;
  private logger: Console | any;

  constructor(
    config: IncidentAnalyzerConfig = {},
    logger: Console | any = console
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Analyze incident using LLM
   *
   * @param incident - Incident to analyze
   * @returns AI analysis result
   */
  async analyze(incident: Incident): Promise<IncidentAnalysis> {
    this.log('info', 'Analyzing incident', { id: incident.id, type: incident.type });

    // Build prompt from incident data
    const prompt = this.buildAnalysisPrompt(incident);

    try {
      // Call LLM
      const result = await platform.llm.complete(prompt, {
        model: this.config.model,
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
        systemPrompt: this.getSystemPrompt(),
      });

      this.log('debug', 'LLM response received', {
        length: result.content.length,
        tokensUsed: result.usage ? (result.usage.promptTokens + result.usage.completionTokens) : undefined,
      });

      // Parse LLM response
      const analysis = this.parseAnalysisResponse(result.content);

      this.log('info', 'Incident analysis complete', {
        id: incident.id,
        rootCausesCount: analysis.rootCauses.length,
        recommendationsCount: analysis.recommendations.length,
      });

      return analysis;
    } catch (error) {
      this.log('error', 'Incident analysis failed', {
        id: incident.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return fallback analysis
      return this.getFallbackAnalysis(incident);
    }
  }

  /**
   * Build analysis prompt from incident data
   * @private
   */
  private buildAnalysisPrompt(incident: Incident): string {
    let prompt = `# Incident Analysis Request\n\n`;
    prompt += `## Incident Overview\n`;
    prompt += `- **ID**: ${incident.id}\n`;
    prompt += `- **Type**: ${incident.type}\n`;
    prompt += `- **Severity**: ${incident.severity}\n`;
    prompt += `- **Title**: ${incident.title}\n`;
    prompt += `- **Time**: ${new Date(incident.timestamp).toISOString()}\n\n`;

    prompt += `## Description\n${incident.details}\n\n`;

    // Add metadata
    if (incident.metadata && Object.keys(incident.metadata).length > 0) {
      prompt += `## Metrics\n`;
      prompt += '```json\n';
      prompt += JSON.stringify(incident.metadata, null, 2);
      prompt += '\n```\n\n';
    }

    // Add related logs
    if (incident.relatedData?.logs && incident.relatedData.logs.sampleErrors.length > 0) {
      prompt += `## Related Error Logs (${incident.relatedData.logs.errorCount} total)\n`;
      incident.relatedData.logs.sampleErrors.forEach((error, idx) => {
        prompt += `${idx + 1}. ${error}\n`;
      });
      prompt += '\n';
    }

    // Add timeline
    if (incident.relatedData?.timeline && incident.relatedData.timeline.length > 0) {
      prompt += `## Event Timeline\n`;
      incident.relatedData.timeline.slice(0, 10).forEach(event => {
        const time = new Date(event.timestamp).toISOString();
        prompt += `- [${time}] (${event.source}) ${event.event}\n`;
      });
      prompt += '\n';
    }

    // Add related metrics
    if (incident.relatedData?.metrics) {
      prompt += `## System Metrics\n`;
      prompt += '```json\n';
      prompt += JSON.stringify(incident.relatedData.metrics, null, 2);
      prompt += '\n```\n\n';
    }

    prompt += `## Analysis Instructions\n`;
    prompt += `Please analyze this incident and provide:\n`;
    prompt += `1. A brief executive summary (2-3 sentences)\n`;
    prompt += `2. Root causes with confidence scores (0.0-1.0) and evidence\n`;
    prompt += `3. Patterns or trends you observe\n`;
    prompt += `4. Actionable recommendations for resolution and prevention\n\n`;

    prompt += `Format your response as JSON:\n`;
    prompt += '```json\n';
    prompt += `{\n`;
    prompt += `  "summary": "Executive summary here",\n`;
    prompt += `  "rootCauses": [\n`;
    prompt += `    {\n`;
    prompt += `      "factor": "Root cause description",\n`;
    prompt += `      "confidence": 0.85,\n`;
    prompt += `      "evidence": "Supporting evidence from logs/metrics"\n`;
    prompt += `    }\n`;
    prompt += `  ],\n`;
    prompt += `  "patterns": ["Pattern 1", "Pattern 2"],\n`;
    prompt += `  "recommendations": ["Recommendation 1", "Recommendation 2"]\n`;
    prompt += `}\n`;
    prompt += '```';

    return prompt;
  }

  /**
   * Get system prompt for incident analysis
   * @private
   */
  private getSystemPrompt(): string {
    return `You are an expert SRE (Site Reliability Engineer) and incident response specialist.
Your role is to analyze system incidents, identify root causes, and provide actionable recommendations.

Guidelines:
- Base your analysis on the actual data provided (logs, metrics, timeline)
- Provide confidence scores based on available evidence (0.0 = no evidence, 1.0 = certain)
- Focus on actionable recommendations that can prevent future incidents
- Be concise but thorough - this is for production systems
- Always respond with valid JSON matching the requested format`;
  }

  /**
   * Parse LLM response into structured analysis
   * @private
   */
  private parseAnalysisResponse(response: string): IncidentAnalysis {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
        ?? response.match(/```\s*([\s\S]*?)\s*```/)
        ?? [null, response];

      const jsonStr = jsonMatch[1] || response;
      const parsed = JSON.parse(jsonStr.trim());

      return {
        summary: parsed.summary || 'No summary provided',
        rootCauses: Array.isArray(parsed.rootCauses) ? parsed.rootCauses : [],
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        analyzedAt: Date.now(),
      };
    } catch (error) {
      this.log('warn', 'Failed to parse LLM response, using fallback', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Try to extract meaningful text even if JSON parsing fails
      return {
        summary: response.substring(0, 200),
        rootCauses: [],
        patterns: [],
        recommendations: [],
        analyzedAt: Date.now(),
      };
    }
  }

  /**
   * Get fallback analysis when LLM is unavailable
   * @private
   */
  private getFallbackAnalysis(incident: Incident): IncidentAnalysis {
    const errorCount = incident.relatedData?.logs?.errorCount ?? 0;
    const sampleErrors = incident.relatedData?.logs?.sampleErrors ?? [];

    return {
      summary: `${incident.severity} ${incident.type} incident detected. ${errorCount} errors logged.`,
      rootCauses: [
        {
          factor: incident.title,
          confidence: 0.5,
          evidence: incident.details,
        },
      ],
      patterns: sampleErrors.length > 0
        ? [`Multiple error types detected: ${sampleErrors.length} unique errors`]
        : [],
      recommendations: [
        'Review related error logs for stack traces',
        'Check system metrics during incident timeframe',
        'Verify external dependencies are operational',
      ],
      analyzedAt: Date.now(),
    };
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, unknown>): void {
    if (level === 'debug' && !this.config.debug) {return;}

    const prefix = '[IncidentAnalyzer]';
    if (this.logger[level]) {
      if (meta) {
        this.logger[level]({ ...meta }, `${prefix} ${message}`);
      } else {
        this.logger[level](`${prefix} ${message}`);
      }
    } else {
      console.log(`${prefix} [${level}] ${message}`, meta ?? '');
    }
  }
}
