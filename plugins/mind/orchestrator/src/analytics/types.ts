/**
 * Analytics event payload types for Mind orchestrator
 */

import type { AgentQueryMode } from '../types';
import type { RetrievalTelemetry } from '../types';

// === EVENT TYPES ===

export type MindEventType =
  // Query lifecycle
  | 'mind.query.started'
  | 'mind.query.completed'
  | 'mind.query.failed'
  // Pipeline stages (optional detailed tracking)
  | 'mind.decompose.completed'
  | 'mind.gather.completed'
  | 'mind.check.completed'
  | 'mind.synthesize.completed'
  // Index operations
  | 'mind.index.started'
  | 'mind.index.completed'
  | 'mind.index.failed'
  // User feedback
  | 'mind.answer.feedback'
  // Verification events
  | 'mind.verification.completed';

// === PAYLOAD SCHEMAS ===

export interface QueryStartedPayload {
  queryId: string;
  text: string;
  textHash: string;
  mode: AgentQueryMode;
  scopeId: string;
  agentMode: boolean;
  [key: string]: unknown;
}

export interface QueryCompletedPayload {
  queryId: string;

  // Timing
  durationMs: number;

  // Quality metrics
  confidence: number;
  complete: boolean;
  sourcesCount: number;
  sourcesBreakdown: {
    code: number;
    docs: number;
    external: Record<string, number>;
  };

  // LLM metrics
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  llmProvider: string;
  llmModel: string;

  // Cost (USD)
  costLlm: number;
  costEmbedding: number;
  costTotal: number;

  // Cache
  cached: boolean;
  cacheLevel?: 'l1' | 'l2' | 'l3';

  // Performance
  mode: AgentQueryMode;
  subqueriesCount: number;
  iterationsCount: number;
  compressionApplied: boolean;
  [key: string]: unknown;
}

export interface QueryFailedPayload {
  queryId: string;
  durationMs: number;
  errorCode: string;
  errorMessage: string;
  recoverable: boolean;
  [key: string]: unknown;
}

export interface StageCompletedPayload {
  queryId: string;
  stage: string;
  durationMs: number;
  [key: string]: unknown;
}

// === FEEDBACK ===

export type FeedbackRating = 'thumbs_up' | 'thumbs_down';
export type FeedbackReason =
  | 'incorrect'
  | 'incomplete'
  | 'outdated'
  | 'hallucination'
  | 'slow'
  | 'helpful'
  | 'other';

export interface AnswerFeedbackPayload {
  /** Request ID from AgentResponse.meta.requestId */
  answerId: string;
  /** Hash of original query */
  queryHash: string;
  /** User rating */
  rating: FeedbackRating;
  /** Optional reason for rating */
  reason?: FeedbackReason;
  /** For agents: what correction was made */
  correction?: string;
  /** Confidence of original answer */
  originalConfidence: number;
  /** Mode used for query */
  mode: AgentQueryMode;
}

// === VERIFICATION ===

export interface VerificationCompletedPayload {
  queryId: string;
  /** Source verification results */
  sourcesTotal: number;
  sourcesVerified: number;
  sourcesFailed: number;
  /** Field verification results */
  fieldsTotal: number;
  fieldsVerified: number;
  fieldsUnverified: number;
  /** Final confidence after verification */
  adjustedConfidence: number;
  /** Original confidence before verification */
  originalConfidence: number;
  /** Warnings generated */
  warningsCount: number;
}

// === ANALYTICS CONTEXT ===

export interface MindAnalyticsContext {
  queryId: string;
  scopeId: string;
  mode: AgentQueryMode;
  startTime: number;

  // Accumulated metrics
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  subqueries: string[];
  iterations: number;
  compressionApplied: boolean;
  retrieval?: RetrievalTelemetry;
}

// === LLM COST CONFIGURATION ===

export interface LLMCostConfig {
  provider: string;
  model: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export const DEFAULT_LLM_COSTS: Record<string, LLMCostConfig> = {
  'gpt-4o-mini': {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
  },
  'gpt-4o': {
    provider: 'openai',
    model: 'gpt-4o',
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10.00,
  },
  'gpt-4-turbo': {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputCostPerMillion: 10.00,
    outputCostPerMillion: 30.00,
  },
};

export function calculateLLMCost(
  tokensIn: number,
  tokensOut: number,
  model: string = 'gpt-4o-mini',
): number {
  const config = DEFAULT_LLM_COSTS[model] ?? DEFAULT_LLM_COSTS['gpt-4o-mini'];
  if (!config) {
    throw new Error(`No cost configuration found for model: ${model}`);
  }
  const inputCost = (tokensIn / 1_000_000) * config.inputCostPerMillion;
  const outputCost = (tokensOut / 1_000_000) * config.outputCostPerMillion;
  return inputCost + outputCost;
}
