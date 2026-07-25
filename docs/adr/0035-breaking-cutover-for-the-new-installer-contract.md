# ADR-0035: Breaking Cutover to the New Installer Contract

**Date:** 2026-07-25
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-07-25
**Tags:** architecture, cli, installer, migration

## Context

Keeping compatibility with the old scenario and manifest layers would leave
two sources of truth and preserve the imperative branches we are replacing.

## Decision

The declarative engine uses a new versioned contract. Existing scenarios are
migrated to it; old intent schemas, old flow representations, and duplicated
scenario handlers are not accepted after cutover. During implementation, the
legacy launcher may remain behind an explicit migration switch so the new
engine can be validated without corrupting the stable UX, but the switch is a
temporary release transition and not a compatibility promise.

## Consequences

The final codebase has one flow/plan/executor path and one technical manifest
source. Migration is simpler and long-term maintenance is lower, at the cost
of a deliberate breaking release and a finite cutover period.
