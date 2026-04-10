# 0015. Claim Verification Before Report

Date: 2026-04-04

## Status

Accepted

## Context

Long-session memory and rollups improved continuity, but code/research tasks still showed a separate failure mode:

- the agent sometimes produced a confident explanatory answer
- the answer was only weakly grounded in actual file/tool evidence
- a later turn then corrected or retracted the claim

This is not primarily a memory problem. It is a final-answer verification problem.

Using a hardcoded `questionType` taxonomy as the enforcement mechanism would be too brittle. One user turn may mix recall, inference, and code explanation in the same answer.

## Decision

We introduce a claim-verification layer in the `report` tool.

The `report` tool now:

1. loads canonical kernel evidence
2. optionally loads archived file/tool evidence when available
3. derives `EvidenceRequirements`
4. verifies whether the answer's claims are sufficiently supported
5. blocks final completion when unsupported claims are presented as facts

The result is represented by `ClaimVerificationResult`.

## Why Not Question Types

We do not gate on rigid categories such as:

- recall
- code_explanation
- architecture
- speculation

Instead we gate on support requirements and unsupported claims:

- whether memory-only recall is acceptable
- whether direct tool evidence is required
- whether file-backed claims are required
- whether inference is allowed
- how many unsupported claims are tolerable

This keeps the model extensible and avoids coupling runtime correctness to a brittle taxonomy.

## Consequences

Positive:

- final answers become evidence-aware
- unsupported code/file claims can be blocked before they reach the user
- shell/session recall remains cheap and permissive
- the mechanism is extensible for future skill and mode policies

Trade-offs:

- an additional verification pass may consume some tokens
- false positives remain possible if the verifier is too strict
- the verifier itself must be grounded only in available evidence

## Follow-up

- extend verification so rollups and summaries also consume verified claims only
- surface `ClaimVerificationResult` in runtime/session diagnostics
- add stricter archive-evidence retrieval for code-explanation runs
