# ADR-0013: Bounded Kernel Evidence Summaries

**Date:** 2026-04-04
**Status:** Accepted
**Deciders:** Assistant, User
**Last Reviewed:** 2026-04-04
**Tags:** [agent-runtime, agent-kernel, memory, continuity, token-efficiency]

## Context

The new kernel/store/runtime architecture improved session continuity, but long sessions still showed a token-efficiency risk:

- `KernelState.memory.evidence` was bounded by item count, not by payload size.
- Large `fs_read` and `grep_search` summaries were being promoted into kernel memory.
- Prompt projection could therefore grow even when evidence count remained bounded.
- This harms long-session quality because noise competes with the truly important continuity facts.

The kernel must remain the source of truth for continuity, but it must store compact evidence rather than raw tool output.

## Decision

We will keep the kernel bounded not only by evidence count, but also by evidence summary shape.

### Rules

- The runtime is responsible for deciding which tool results are promoted into kernel evidence.
- The kernel does not auto-promote arbitrary `artifact.summary` strings anymore.
- Promoted evidence must be compact, typed, and tool-aware.
- Large raw outputs remain in `tool-ledger.jsonl` and `trace.ndjson`, not in `KernelState`.

### Tool-aware evidence shaping

The runtime will build compact evidence summaries before promotion:

- `fs_read` → file path + line range summary
- `grep_search` → match count + top file references
- `fs_list` → directory path + counts
- `shell_exec` → command + compact output excerpt
- `memory_correction` / `memory_constraint` → short canonical memory commit summary

### Non-goal

This ADR does not introduce semantic summarization of evidence with another LLM pass. It only enforces bounded structural compaction.

## Consequences

### Positive

- Prompt projection remains smaller on long sessions.
- Kernel evidence becomes more stable and easier to rank.
- Follow-up recall still works because tool input and compact meaning are preserved.
- Raw detail remains available in tool ledger and trace.

### Negative

- Some very detailed raw excerpts are no longer directly available from kernel memory.
- If compaction is too aggressive, follow-up quality may regress.
- Tool-specific summary logic now lives in runtime and must be maintained carefully.

## Implementation

- Remove implicit fallback promotion from `recordToolArtifact()` in `agent-kernel`
- Add compact tool-aware evidence shaping in `agent-runtime`
- Keep full raw detail in session artifacts and trace
- Re-run long-session evaluations for continuity and token usage

## Review Trigger

Revisit after:

- adding token accounting into `run-ledger.jsonl`
- introducing prompt-profile consumers for routing hints
- collecting more long-session benchmarks
