/**
 * @kb-labs/mind-orchestrator
 *
 * Agent-optimized RAG query orchestration for KB Labs Mind.
 *
 * Features:
 * - Query decomposition into sub-queries
 * - Completeness checking with retry
 * - Response synthesis with sources
 * - Token budget compression
 * - instant/auto/thinking modes
 */

// Main orchestrator
export {
  AgentQueryOrchestrator,
  createAgentQueryOrchestrator,
} from './orchestrator';
export type { AgentQueryOrchestratorOptions } from './orchestrator';

// Types
export * from './types';

// Components
export { QueryDecomposer, createQueryDecomposer } from './decomposer/index';
export { ChunkGatherer, createChunkGatherer } from './gatherer/index';
export { CompletenessChecker, createCompletenessChecker } from './checker/index';
export { ResponseSynthesizer, createResponseSynthesizer } from './synthesizer/index';
export { ResponseCompressor, createResponseCompressor } from './compressor/index';

// LLM utilities
export { completeJSON, type LLMJSONOptions } from './llm/index';

// Analytics
export {
  createMindAnalytics,
  type MindAnalytics,
  type MindAnalyticsOptions,
  type MindAnalyticsContext,
  type MindEventType,
  type QueryStartedPayload,
  type QueryCompletedPayload,
  type QueryFailedPayload,
  type FeedbackRating,
  type FeedbackReason,
  type AnswerFeedbackPayload,
  type VerificationCompletedPayload,
  calculateLLMCost,
  DEFAULT_LLM_COSTS,
} from './analytics/index';

// Verification (anti-hallucination)
export {
  SourceVerifier,
  createSourceVerifier,
  FieldChecker,
  createFieldChecker,
  extractCodeMentions,
  verifyMentionsInChunks,
  hasLikelyHallucinations,
  type SourceVerificationResult,
  type VerificationSummary,
  type SourceVerifierOptions,
  type FieldCheckResult,
  type FieldCheckerOptions,
} from './verification/index';

// Context management
export {
  TokenBudgetPlanner,
  createTokenBudgetPlanner,
  formatChunksWithNumbers,
  categorizeChunks,
  type TokenBudgetConfig,
  type AssembledContext,
} from './context/index';

// Index freshness
export {
  checkIndexFreshness,
  createStaleIndexWarning,
  createGitExecutor,
  readIndexMetadata,
  type IndexFreshness,
  type IndexMetadata,
} from './freshness/index';

// Pipeline & Graceful Degradation
export {
  GracefulDegradationHandler,
  createGracefulDegradationHandler,
  getDegradedMode,
  MODE_DEGRADATION_CHAIN,
  type DegradationResult,
  type PipelineStepConfig,
  type GracefulDegradationOptions,
} from './pipeline/index';

// Query Cache
export {
  QueryCache,
  createQueryCache,
  hashQuery,
  type CacheEntry,
  type QueryCacheOptions,
} from './cache/index';

// Re-export agent response contracts from package-local types
export {
  type AgentResponse,
  type AgentErrorResponse,
  type AgentSource,
  type AgentMeta,
  type AgentQueryMode,
  type AgentSourceKind,
  type AgentSuggestion,
  type AgentDebugInfo,
  type AgentErrorCode,
  type AgentWarning,
  type AgentWarningCode,
  isAgentError,
  isAgentSuccess,
  AGENT_RESPONSE_SCHEMA_VERSION,
  CONFIDENCE_THRESHOLDS,
} from './types';
