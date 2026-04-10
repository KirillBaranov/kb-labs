# 0014. Long-Session Compaction And Rollups

Date: 2026-04-04

## Status

Accepted

## Context

The runtime now has a stable kernel-backed continuity model, but long sessions still accumulate historical state:

- completed pending actions
- stale or duplicated evidence
- repeated working summaries
- increasingly expensive prompt projections

Pure transcript truncation is not sufficient, and pure LLM summarization is not reliable enough to act as the memory authority.

We need a long-session strategy that preserves correctness while keeping prompt cost bounded.

## Decision

We introduce a hybrid long-session compaction model:

1. `KernelState` remains the source of truth.
2. `compactKernelState()` deterministically prunes historical noise while preserving durable state.
3. `memory-rollup.json` stores a compact rollup summary for inspection and prompt projection.
4. An optional LLM-generated narrative rollup may be produced by the runtime, but only as an enhancement layer.

The authoritative continuity set remains:

- objective
- constraints
- corrections
- decisions
- recent/pinned evidence
- unresolved/pending work
- latest handoff

The rollup is additive. It does not replace any of these fields.

## Compaction Rules

Deterministic compaction handles:

- pruning noisy evidence such as transient blocked `report` failures
- pruning memory tool evidence once the underlying correction is already committed
- keeping only recent successful evidence plus pinned items
- keeping all active pending actions and only a short tail of completed ones
- keeping only a bounded child-result history

## LLM Narrative Rollup

The runtime may generate a short narrative summary for longer sessions when thresholds are exceeded.

This summary:

- uses only current structured kernel state
- must stay concise
- must not invent facts
- must not replace structured memory

If no LLM is available, runtime falls back to a deterministic narrative summary.

## Consequences

Positive:

- prompt cost stays bounded over long sessions
- continuity remains anchored in structured state
- future turns get a compact high-level narrative layer
- CLI and Studio can inspect a dedicated rollup artifact

Trade-offs:

- one more derived artifact to persist
- rollup quality depends on compaction thresholds
- optional LLM rollup adds a small extra cost on longer sessions

## Follow-up

- add token/cost stats directly to `run-ledger.jsonl`
- add semantic dedupe for near-duplicate evidence
- expose rollup inspection in CLI/Studio session UX
