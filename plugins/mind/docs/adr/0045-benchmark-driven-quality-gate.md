# ADR-0045: Benchmark-Driven Quality Gate for Retrieval Changes

**Date:** 2026-02-14
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-02-14
**Tags:** [benchmarking, quality, testing, search]

## Context

Search quality regressions were hard to detect from code review alone. Minor ranking changes could silently break exact lookup scenarios or reduce relevance in specific modes.

A stable, repeatable benchmark process is required before accepting retrieval architecture changes.

## Decision

Adopt a **golden-set quality gate** as required validation for retrieval changes:

1. Maintain a curated benchmark dataset across key groups:
- exact code lookup,
- freshness policy,
- conflict policy,
- reliability policy,
- conceptual architecture queries.

2. Run benchmark script from monorepo root:
- `node kb-labs-mind/packages/mind-engine/scripts/run-quality-eval.mjs --runs 1 --modes instant,auto,thinking`

3. Treat benchmark outcome as release gate for search changes.

Baseline snapshot at stabilization close:
- all modes: `hit@1=93.3%`, `hit@5=100%`
- auto mode control: `hit@1=100%`, `hit@5=100%`

## Consequences

### Positive

- Regressions are visible and measurable.
- Easier to iterate on ranking safely.
- Shared objective score for architecture decisions.

### Negative

- Benchmark maintenance overhead.
- Risk of overfitting to fixed golden set if not refreshed.

### Alternatives Considered

- Manual spot checks only: rejected (not reproducible).
- Integration tests without quality metrics: rejected (insufficient for ranking validation).
- Large fully automated benchmark suite only: rejected for now (too heavy for fast iteration).

## Implementation

- Benchmark script:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/scripts/run-quality-eval.mjs`
- Golden set:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/benchmarks/golden-set.v4.json`
- Bench docs:
  `/Users/kirillbaranov/Desktop/kb-labs/kb-labs-mind/packages/mind-engine/BENCHMARKS.md`

## References

- [ADR-0042: Query Classification with Rules First and LLM Tool Fallback](./0042-query-classification-rules-plus-llm-tools-fallback.md)
- [ADR-0043: Mode-Specific Retrieval Strategy](./0043-mode-specific-retrieval-strategy.md)

---

**Last Updated:** 2026-02-14
**Next Review:** 2026-05-14
