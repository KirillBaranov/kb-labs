# ADR-0017: Widget Registry Phased Rollout

**Date:** 2025-11-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [architecture, process]

## Context

Studio Dashboard needs extensibility for plugins. We considered:
- Full plugin system from day 1
- Widget registry only for Dashboard
- No extensibility in MVP

Goal: Start simple, grow extensibility over time.

## Decision

**Start with Dashboard-only widget registry, defer full plugin system.**

**MVP: Dashboard Widget Registry**
- Single registry area: `'dashboard'`
- Simple registration: `registerWidget('dashboard', id, Component)`
- Render via `<WidgetSlot area="dashboard" />`
- Built-in widgets registered at app init

**Future: Plugin System**
- Multiple areas (Dashboard, Audit, Release, etc.)
- Dynamic loading from external sources
- Plugin API for third-party widgets

**Rationale:**
- Dashboard is natural first area for extensibility
- Proves concept without full complexity
- Easy to evolve into full plugin system
- Doesn't block MVP delivery

## Consequences

### Positive

- Simple, focused MVP approach
- Proves extensibility concept
- Clear evolution path
- Doesn't over-engineer

### Negative

- Only Dashboard extensible initially
- Need to rework for full plugin system later

### Alternatives Considered

- **Full plugin system**: Too complex for MVP
- **No extensibility**: Missed opportunity, harder to add later
- **External widget library**: Adds complexity, premature

## Implementation

- Registry in `apps/studio/src/registry/`
- Single area: `dashboard`
- Simple array-based storage
- Future: Expand to full plugin architecture

## References

- [Plugin System Architecture](../kb-labs/docs/adr/0002-plugins-and-extensibility.md)

