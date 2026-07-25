# ADR-0031: Deterministic Plans, Journaled Execution, and Recovery

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, installer, reliability

## Context

Installation mutates package state, provider bindings, and generated config.
Partial failure must be inspectable and retryable without inventing a second
flow.

## Decision

The compiler produces a stable action DAG with catalog and plan hashes. The
executor persists a journal, uses a scoped lock, applies bounded retries, and
invokes declared rollback handlers where available. Resume and diagnostics are
based on the recorded plan/journal rather than re-running scenario logic.

## Consequences

Failures become structured state with actionable recovery. The executor needs
filesystem state and handler contracts, but package managers and providers stay
behind adapters.
