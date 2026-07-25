# ADR-0028: Human and Agent Frontends Share the Installation Engine

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, cli, ux, ci

## Context

Interactive users and Agents/CI receive data differently, but duplicated
validation and installation logic would inevitably diverge.

## Decision

Human mode renders the engine's screen model through the common terminal UI.
Agent mode uses the JSON protocol and receives the same scenario descriptors,
input requests, screens, plans, errors, and recovery actions. CI uses a direct,
deterministic install request and does not execute interactive scenarios.

## Consequences

UX and validation stay consistent. CI is intentionally boring and
reproducible. Human presentation and machine transport can evolve separately
without creating a second installer implementation.

## Implementation

`tools/kb-create/internal/engine/ui` owns the UI model; `cmd/agent.go` is only
a transport adapter; `internal/engine/direct` compiles non-interactive CI
requests.
