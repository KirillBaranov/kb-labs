import type { RetrievalMode } from './freshness';

export interface ReliabilityConfig {
  hardStaleFailClosed: boolean;
  confidenceFloor: number;
  thinkingModeStrict: boolean;
}

export interface ReliabilityInput {
  stalenessLevel: 'fresh' | 'soft-stale' | 'hard-stale';
  retrievalMode: RetrievalMode;
  scores: number[];
  queryMetadata?: Record<string, unknown>;
}

export interface ReliabilityDecision {
  confidence: number;
  agentMode: boolean;
  strictMode: boolean;
  failClosed: boolean;
  belowConfidenceFloor: boolean;
  recoverableHints: string[];
}

export interface ConfidenceAdjustments {
  stalenessPenalty: number;
  conflictPenalty: number;
  floorGap: number;
  finalConfidence: number;
}

export function evaluateReliability(
  input: ReliabilityInput,
  config: ReliabilityConfig,
): ReliabilityDecision {
  const confidence = calculateConfidence(input.scores);
  const agentMode = isAgentMode(input.queryMetadata);
  const strictMode = agentMode || (config.thinkingModeStrict && input.retrievalMode === 'thinking');

  const failClosed =
    strictMode &&
    config.hardStaleFailClosed &&
    input.stalenessLevel === 'hard-stale';
  const belowConfidenceFloor = strictMode && confidence < config.confidenceFloor;

  const recoverableHints: string[] = [];
  if (failClosed) {
    recoverableHints.push('reindex_scope');
    recoverableHints.push('refresh_docs_sources');
    recoverableHints.push('retry_query_after_index');
  } else if (belowConfidenceFloor) {
    recoverableHints.push('narrow_query_scope');
    recoverableHints.push('ask_follow_up_subquery');
    recoverableHints.push('retry_in_thinking_mode');
  }

  return {
    confidence,
    agentMode,
    strictMode,
    failClosed,
    belowConfidenceFloor,
    recoverableHints,
  };
}

export function buildConfidenceAdjustments(options: {
  stalenessLevel: ReliabilityInput['stalenessLevel'];
  penalizedConflicts: number;
  confidenceFloor: number;
  decision: ReliabilityDecision;
}): ConfidenceAdjustments {
  const stalenessPenalty = options.stalenessLevel === 'hard-stale'
    ? 0.25
    : options.stalenessLevel === 'soft-stale'
      ? 0.1
      : 0;
  const conflictPenalty = Math.min(0.2, Math.max(0, options.penalizedConflicts) * 0.03);
  const floorGap = options.decision.strictMode
    ? Math.max(0, options.confidenceFloor - options.decision.confidence)
    : 0;

  return {
    stalenessPenalty,
    conflictPenalty,
    floorGap,
    finalConfidence: options.decision.confidence,
  };
}

function isAgentMode(metadata?: Record<string, unknown>): boolean {
  if (!metadata) {
    return false;
  }
  return (
    metadata.agentMode === true ||
    metadata.consumer === 'agent' ||
    metadata.actor === 'agent'
  );
}

function calculateConfidence(scores: number[]): number {
  if (scores.length === 0) {
    return 0;
  }
  const top = [...scores]
    .sort((a, b) => b - a)
    .slice(0, 3);
  const sum = top.reduce((acc, score) => acc + score, 0);
  return sum / top.length;
}
