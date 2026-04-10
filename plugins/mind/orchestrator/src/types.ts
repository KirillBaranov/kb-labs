/**
 * Mind Orchestrator Types
 *
 * Internal types for the orchestration pipeline.
 */

import type { MindChunk } from '@kb-labs/mind-types';

// === AGENT CONTRACTS (package-local public surface) ===

export type AgentQueryMode = 'instant' | 'auto' | 'thinking';
export type AgentSourceKind = 'file' | 'doc' | 'adr' | 'repo' | 'code' | 'config' | 'external';
export type AgentErrorCode = string;
export type AgentWarningCode = string;

export interface AgentSource {
  file: string;
  lines?: [number, number];
  snippet?: string;
  kind: AgentSourceKind;
  relevance?: number | string;
}

export interface AgentWarning {
  code: AgentWarningCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface AgentMeta {
  schemaVersion: string;
  requestId: string;
  mode: AgentQueryMode;
  timingMs: number;
  cached: boolean;
  confidence?: number;
  complete?: boolean;
  sources?: number;
  indexVersion?: string;
  warnings?: AgentWarning[];
  [key: string]: unknown;
}

export interface AgentSuggestion {
  type: string;
  label: string;
  ref: string;
}

export interface AgentDebugInfo {
  [key: string]: unknown;
}

export interface AgentSourcesSummary {
  code: number;
  docs: number;
  external: Record<string, number>;
  [key: string]: unknown;
}

export interface AgentResponse {
  answer: string;
  sources: AgentSource[];
  confidence: number;
  complete: boolean;
  sourcesSummary?: AgentSourcesSummary;
  warnings?: AgentWarning[];
  suggestions?: AgentSuggestion[];
  meta: AgentMeta;
  debug?: AgentDebugInfo;
}

export interface AgentErrorResponse {
  error: { code: AgentErrorCode; message: string; recoverable: boolean };
  meta: AgentMeta;
}

export const AGENT_RESPONSE_SCHEMA_VERSION = 'agent-response-v1';
export const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.6,
  low: 0.3,
} as const;

export function isAgentError(value: unknown): value is AgentErrorResponse {
  return !!value && typeof value === 'object' && 'error' in value;
}

export function isAgentSuccess(value: unknown): value is AgentResponse {
  return !!value && typeof value === 'object' && 'answer' in value && 'sources' in value;
}

// === ORCHESTRATOR CONFIG ===

export interface OrchestratorModeConfig {
  instant: {
    maxChunks: number;
    skipLLM: boolean;
  };
  auto: {
    maxSubqueries: number;
    chunksPerQuery: number;
    maxIterations: number;
  };
  thinking: {
    maxSubqueries: number;
    chunksPerQuery: number;
    maxIterations: number;
    enableCrossReference: boolean;
  };
}

export interface OrchestratorLLMConfig {
  provider: 'openai' | 'sber' | 'local';
  model: string;
  temperature: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface OrchestratorSynthesisConfig {
  maxSourceSnippets: number;
  snippetMaxLines: number;
}

export interface OrchestratorCompressionConfig {
  maxResponseTokens: number;
  maxSnippetLines: number;
  maxSources: number;
  compressionStrategy: 'truncate' | 'summarize' | 'smart';
}

export interface OrchestratorCacheConfig {
  enabled: boolean;
  l1TtlMs: number;
  l2TtlMs: number;
  cacheDir: string;
}

export interface OrchestratorConfig {
  mode: AgentQueryMode;
  autoDetectComplexity: boolean;
  deterministic: boolean;
  llm: OrchestratorLLMConfig;
  modes: OrchestratorModeConfig;
  synthesis: OrchestratorSynthesisConfig;
  compression: OrchestratorCompressionConfig;
  cache: OrchestratorCacheConfig;
}

// === QUERY OPTIONS ===

export interface OrchestratorQueryOptions {
  cwd: string;
  scopeId?: string;
  text: string;
  mode?: AgentQueryMode;
  indexRevision?: string;
  engineConfigHash?: string;
  sourcesDigest?: string;
  sources?: string[];
  maxTokens?: number;
  noCache?: boolean;
  idempotencyKey?: string;
  debug?: boolean;
}

// === INTERNAL TYPES ===

export interface QueryComplexity {
  level: 'simple' | 'medium' | 'complex';
  reason: string;
  suggestedMode: AgentQueryMode;
}

export interface DecomposedQuery {
  original: string;
  subqueries: string[];
  reasoning?: string;
}

export interface GatheredChunks {
  chunks: MindChunk[];
  subqueryResults: Map<string, MindChunk[]>;
  totalMatches: number;
  retrieval?: RetrievalTelemetry;
}

export interface ConfidenceAdjustments {
  stalenessPenalty?: number;
  conflictPenalty?: number;
  floorGap?: number;
  finalConfidence?: number;
}

export interface RetrievalTelemetry {
  retrievalProfile?: AgentQueryMode;
  freshnessApplied?: boolean;
  boostedCandidates?: number;
  stalenessLevel?: 'fresh' | 'soft-stale' | 'hard-stale';
  conflictsDetected?: number;
  conflictTopics?: number;
  conflictPolicy?: string;
  confidence?: number;
  complete?: boolean;
  recoverable?: boolean;
  failClosed?: boolean;
  recoverableHints?: string[];
  confidenceAdjustments?: ConfidenceAdjustments;
  indexRevision?: string | null;
  engineConfigHash?: string | null;
  sourcesDigest?: string | null;
}

export interface CompletenessResult {
  complete: boolean;
  confidence: number;
  missing?: string[];
  sourcesChecked: string[];
  suggestSources?: Array<{
    source: string;
    reason: string;
    query?: string;
  }>;
}

export interface SynthesisResult {
  answer: string;
  sources: AgentSource[];
  confidence: number;
  complete: boolean;
  suggestions?: Array<{
    type: 'adr' | 'repo' | 'doc' | 'file' | 'next-question';
    label: string;
    ref: string;
  }>;
  warnings?: AgentWarning[];
}

// === LLM STATS ===

export interface LLMStats {
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

// === ORCHESTRATOR RESULT ===

export type OrchestratorResult = AgentResponse | AgentErrorResponse;

// === DEFAULT CONFIG ===

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  mode: 'auto',
  autoDetectComplexity: true,
  deterministic: false,
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.2,
  },
  modes: {
    instant: {
      maxChunks: 5,
      skipLLM: true,
    },
    auto: {
      maxSubqueries: 3,
      chunksPerQuery: 8,
      maxIterations: 1,
    },
    thinking: {
      maxSubqueries: 5,
      chunksPerQuery: 12,
      maxIterations: 3,
      enableCrossReference: true,
    },
  },
  synthesis: {
    maxSourceSnippets: 5,
    snippetMaxLines: 20,
  },
  compression: {
    maxResponseTokens: 4000,
    maxSnippetLines: 30,
    maxSources: 5,
    compressionStrategy: 'smart',
  },
  cache: {
    enabled: true,
    l1TtlMs: 5 * 60 * 1000,     // 5 minutes
    l2TtlMs: 60 * 60 * 1000,    // 1 hour
    cacheDir: '.kb/mind/cache',
  },
};
