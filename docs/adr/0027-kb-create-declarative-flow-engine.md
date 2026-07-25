# ADR-0027: Declarative Flow Engine for kb-create

**Date:** 2026-07-25
**Status:** Accepted — implementation in progress
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, cli, tooling, installer

## Context

The launcher had good user experience but encoded scenarios, compatibility,
config generation, and installation behavior in imperative Go branches. This
made small changes risky and caused drift between commit, release, custom, and
plugin-author flows.

## Decision

Describe installation scenarios as declarative pages, sections, fields,
defaults, validation, transitions, and install intents. Compile the resulting
state into one deterministic installation plan consumed by both human and
machine frontends. The old scenario implementation is not a compatibility
target; scenarios are migrated to the new engine.

## Consequences

The flow model, plan compiler, executor, UI model, and error protocol are
shared. New scenarios become data plus manifest-declared intents. The engine
requires explicit contracts and more upfront validation, but removes repeated
per-scenario control flow.

## Implementation

The implementation lives under `tools/kb-create/internal/engine`; `flow`,
`plan`, `executor`, `config`, and `ui` remain independent of Cobra and terminal
rendering.

## References

- [Declarative flow engine plan](../plans/2026-07-25-kb-create-declarative-flow-engine.md)
