import { describe, expect, it } from 'vitest';
import {
  buildConfidenceAdjustments,
  evaluateReliability,
  type ReliabilityConfig,
} from '../reliability';

const config: ReliabilityConfig = {
  hardStaleFailClosed: true,
  confidenceFloor: 0.75,
  thinkingModeStrict: true,
};

describe('reliability', () => {
  it('fails closed on hard-stale in strict mode', () => {
    const decision = evaluateReliability(
      {
        stalenessLevel: 'hard-stale',
        retrievalMode: 'thinking',
        scores: [0.91, 0.78, 0.74],
      },
      config,
    );

    expect(decision.strictMode).toBe(true);
    expect(decision.failClosed).toBe(true);
    expect(decision.recoverableHints).toContain('reindex_scope');
  });

  it('marks below confidence floor for agent mode', () => {
    const decision = evaluateReliability(
      {
        stalenessLevel: 'fresh',
        retrievalMode: 'auto',
        scores: [0.4, 0.5, 0.2],
        queryMetadata: { agentMode: true },
      },
      config,
    );

    expect(decision.agentMode).toBe(true);
    expect(decision.belowConfidenceFloor).toBe(true);
    expect(decision.failClosed).toBe(false);
    expect(decision.recoverableHints).toContain('narrow_query_scope');
  });

  it('builds confidence adjustments breakdown', () => {
    const decision = evaluateReliability(
      {
        stalenessLevel: 'soft-stale',
        retrievalMode: 'thinking',
        scores: [0.7, 0.68, 0.66],
      },
      config,
    );

    const adjustments = buildConfidenceAdjustments({
      stalenessLevel: 'soft-stale',
      penalizedConflicts: 2,
      confidenceFloor: config.confidenceFloor,
      decision,
    });

    expect(adjustments.stalenessPenalty).toBe(0.1);
    expect(adjustments.conflictPenalty).toBe(0.06);
    expect(adjustments.floorGap).toBeGreaterThan(0);
    expect(adjustments.finalConfidence).toBe(decision.confidence);
  });
});
