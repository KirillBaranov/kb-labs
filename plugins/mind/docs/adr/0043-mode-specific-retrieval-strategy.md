# ADR-0043: Mode-Specific Retrieval Strategy (Instant, Auto, Thinking)

**Date:** 2026-02-14
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-14
**Tags:** [orchestrator, retrieval, agents, reliability]

## Context

Mind serves multiple consumers with different runtime profiles:
- `instant`: minimal latency,
- `auto`: balanced quality and speed,
- `thinking`: deeper retrieval and synthesis.

Using identical retrieval behavior across all modes caused either unnecessary latency in fast paths or poor quality in deeper paths.

## Decision

Adopt **mode-specific retrieval orchestration**:

1. `instant`
- no expensive decomposition for clear simple/technical lookup,
- strict chunk budget and faster response path.

2. `auto`
- balanced decomposition and weighted retrieval,
- default mode for agent runtime with quality safeguards.

3. `thinking`
- broader decomposition and larger retrieval window,
- stricter synthesis path and confidence handling.

Additional decision:
- simple technical/debug lookups short-circuit to instant path to avoid noisy decomposition.

## Consequences

### Positive

- Better latency/quality tradeoff per mode.
- Fewer routing errors for exact technical queries.
- More predictable behavior for agent orchestration chains.

### Negative

- More configuration and test surface.
- Potential mode drift if benchmarks are not maintained.

### Alternatives Considered

- One-mode retrieval policy: rejected (cannot satisfy both SLA and depth requirements).
- Always decompose queries: rejected (degrades exact lookup quality and increases latency).

## Implementation

- Decomposition and complexity policy:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-orchestrator/src/decomposer/query-decomposer.ts`
- Gathering and mode-aware reranking:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-orchestrator/src/gatherer/chunk-gatherer.ts`
- Mode behavior inside orchestrator:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-orchestrator/src/orchestrator.ts`

## References

- [ADR-0029: Agent Query Orchestration](./0029-agent-query-orchestration.md)
- [ADR-0035: Orchestrator Performance Optimizations](./0035-orchestrator-performance-optimizations.md)

---

**Last Updated:** 2026-02-14
**Next Review:** 2026-05-14
