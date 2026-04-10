# ADR-0046: Online Learning Loop for Retrieval Adaptation

**Date:** 2026-02-14
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-14
**Tags:** [learning, retrieval, ranking, feedback]

## Context

Static ranking rules are not enough for long-term quality in heterogeneous repositories. Mind needs a feedback loop that adapts ranking behavior from real usage while staying deterministic and auditable.

Existing components already collect signals, but decisions around their role and boundaries were not explicitly documented.

## Decision

Adopt **online retrieval adaptation** (not model fine-tuning) as the learning strategy:

1. Persist query history and top result traces.
2. Collect feedback signals:
- implicit usage feedback,
- self-feedback,
- explicit feedback channel support.
3. Apply learning outputs at retrieval time:
- popularity boost,
- query-pattern boost,
- adaptive vector/keyword weighting.

Boundary decision:
- learning updates retrieval behavior only,
- no direct model fine-tuning in Mind engine.

## Consequences

### Positive

- Continuous improvement from real workloads.
- Better ranking personalization by scope/context.
- Keeps learning transparent and inspectable.

### Negative

- Signal noise can mislead ranking without quality controls.
- Storage and lifecycle management required for history/feedback data.

### Alternatives Considered

- No learning loop: rejected (stagnant quality).
- Full RL/finetuning pipeline inside engine: rejected (too complex and high operational risk).

## Implementation

- Learning integration in engine:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/index.ts`
- Query history:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/learning/query-history.ts`
- Feedback store:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/learning/feedback.ts`
- Popularity:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/learning/popularity.ts`
- Query patterns:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/learning/query-patterns.ts`
- Adaptive weights:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/learning/adaptive-weights.ts`

## References

- [ADR-0019: Self-Learning System](./0019-self-learning-system.md)
- [ADR-0045: Benchmark-Driven Quality Gate](./0045-benchmark-driven-quality-gate.md)

---

**Last Updated:** 2026-02-14
**Next Review:** 2026-05-14
