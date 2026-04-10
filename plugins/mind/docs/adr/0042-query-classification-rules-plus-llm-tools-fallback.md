# ADR-0042: Query Classification with Rules First and LLM Tool Fallback

**Date:** 2026-02-14
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-14
**Tags:** [search, retrieval, orchestrator, quality]

## Context

Mind search quality depends on correct routing between exact lookup behavior and semantic exploration.

Before stabilization, classification relied mostly on static heuristics and produced instability on mixed queries (exact token + conceptual wording). Pure LLM classification was considered too expensive and too brittle for hot path usage.

Constraints:
- low latency for agent-heavy traffic,
- deterministic fallback on failures,
- no dependency on "please return JSON" parsing.

## Decision

Use a **hybrid classifier**:

1. **Rules first** for high-confidence cases:
- identifiers (`camelCase`, `PascalCase`, `kebab-case`, flags like `--mode`),
- CLI/command signals,
- technical lookup patterns.

2. **LLM fallback only in uncertainty band**, using native tool-calling (`chatWithTools`) via `useLLM`.
- Tool: `set_query_profile`
- Output: profile + confidence + recall strategy
- Strict validation and bounded merge into baseline decision.

3. **Fail-safe fallback**:
- if tool call is unavailable, invalid, timeout, or low confidence -> keep rule-based decision.

4. **Short TTL cache** for repeated classifier decisions.

## Consequences

### Positive

- Better routing quality on ambiguous queries.
- Deterministic behavior under LLM errors.
- Uses platform-native tool calling API (no fragile free-form JSON parsing).

### Negative

- Additional classifier complexity in search path.
- Extra LLM cost/latency for uncertainty-band queries.
- Need periodic calibration of thresholds.

### Alternatives Considered

- Rules only: rejected (insufficient on ambiguous requests).
- LLM only: rejected (latency/cost and reliability risks).
- Text JSON prompting: rejected (less robust than native tool-calling).

## Implementation

- Classifier logic and fallback policy:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/search/query-classifier.ts`
- Adaptive hybrid integration:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/search/adaptive-hybrid.ts`
- Engine wiring through `useLLM`:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/src/index.ts`

## References

- [ADR-0033: Adaptive Search Weights](./0033-adaptive-search-weights.md)
- [ADR-0018: Hybrid Search with RRF](./0018-hybrid-search-rrf.md)

---

**Last Updated:** 2026-02-14
**Next Review:** 2026-05-14
