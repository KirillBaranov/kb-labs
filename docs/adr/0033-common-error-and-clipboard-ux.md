# ADR-0033: Common Error, Recovery, and Clipboard UX

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** ux, cli, agents

## Context

Errors were previously coupled to individual imperative steps. Users and
Agents need to understand what failed, why, and what action is safe next.

## Decision

The engine emits stable error codes, human-readable messages, structured
metadata, and recovery actions. The same error is rendered by the terminal UI
or serialized by the agent protocol. Clipboard support is a presentation
capability over the same generated text/JSON payload and never changes the
installation result.

## Consequences

Scenario definitions can react to error state without parsing terminal text.
Output remains useful in CI logs and copy/paste workflows. Renderers must keep
the protocol stable while adding visual improvements.
