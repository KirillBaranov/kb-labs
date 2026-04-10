# 0016. Prompt Context Selection

Date: 2026-04-04

## Status

Accepted

## Context

The kernel already stores better long-session continuity, but prompt projection still suffered from a selection problem:

- structured evidence was available
- working summaries were available
- the runtime always projected the same broad prompt shape
- follow-up recall questions could therefore be answered from stale prose instead of direct evidence

This is not primarily a storage problem. It is a context-selection problem.

## Decision

We introduce `PromptContextSelector` as an official SDK extension point.

The selector decides which parts of structured kernel memory should be shown to the model for the current turn:

- whether to include rollup
- whether to include working summary
- whether to emphasize evidence
- whether to emphasize prior tool usage
- how many items to include from each section

`projectKernelPrompt()` becomes selection-driven instead of always rendering the same fixed context window.

## Default Behavior

The default selector is LLM-based with a deterministic fallback.

The fallback only applies a small number of generic recall-oriented heuristics and never becomes the memory authority. The authority remains the kernel.

## Consequences

Positive:

- recall-style turns can prefer direct evidence over stale summaries
- long-session context becomes more adaptive without changing kernel truth
- future skills/modes can install their own context selectors

Trade-offs:

- one more runtime decision step before prompt projection
- selector quality now matters for answer quality

## Follow-up

- feed selector rationale into session diagnostics
- add specialized selectors for research/spec/debug modes
- integrate verified claims so summaries and rollups are also section-selected from supported context
