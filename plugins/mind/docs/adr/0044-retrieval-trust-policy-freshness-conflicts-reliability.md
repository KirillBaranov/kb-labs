# ADR-0044: Retrieval Trust Policy (Freshness, Conflicts, Reliability)

**Date:** 2026-02-14
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-14
**Tags:** [reliability, freshness, anti-hallucination, search]

## Context

For agent chains, stale or conflicting context can propagate failures across multiple downstream steps.

Mind needs deterministic handling for:
- stale documentation vs newer sources,
- contradictory chunks on same topic,
- low-confidence retrieval outcomes.

## Decision

Use a **three-layer trust policy** after retrieval:

1. **Freshness ranking**
- source-type-aware freshness boost,
- staleness level diagnostics (`fresh`, `soft-stale`, `hard-stale`).

2. **Conflict resolution**
- deterministic conflict grouping and loser penalization,
- freshness-first policy for competing candidates.

3. **Reliability gate**
- confidence floor enforcement,
- strict behavior in higher-assurance modes,
- fail-closed where required.

Policy output is exposed in retrieval metadata for downstream consumers and observability.

## Consequences

### Positive

- Lower risk of stale guidance in agent workflows.
- Deterministic resolution of contradictions.
- Clear confidence signaling for orchestration decisions.

### Negative

- Additional ranking complexity.
- Risk of over-penalization if thresholds are too strict.

### Alternatives Considered

- Freshness only: rejected (conflicts and confidence still unresolved).
- Confidence-only gating: rejected (insufficient without freshness/conflict control).
- LLM-only trust judgment: rejected (non-deterministic and harder to audit).

## Implementation

- Freshness layer:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/search/freshness.ts`
- Conflict layer:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/search/conflicts.ts`
- Reliability layer:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/search/reliability.ts`
- End-to-end application:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/index.ts`

## References

- [ADR-0031: Anti-Hallucination System](./0031-anti-hallucination-system.md)
- [ADR-0033: Adaptive Search Weights](./0033-adaptive-search-weights.md)

---

**Last Updated:** 2026-02-14
**Next Review:** 2026-05-14
