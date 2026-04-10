# ADR-0015: MVP Module Scope

**Date:** 2025-11-01
**Status:** Superseded by [ADR-0022](./0022-studio-widget-system-v2.md)
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-02
**Tags:** [process, architecture]

> **Note (2026-04-02):** The hardcoded-modules approach described here is superseded by the Module Federation plugin system (ADR-0022). Modules (agents, qa, quality, release) are no longer part of the Studio core bundle — they ship as standalone plugins served via MF remotes.

## Context

Studio has 7 planned modules: Dashboard, Audit, Release, DevLink, Mind, Analytics, Settings. We considered:
- Build all 7 fully in MVP
- Defer some modules entirely
- Stub approach for some modules

Goal: Ship working MVP quickly while showing full vision.

## Decision

**Narrow MVP scope: 4 full modules, 3 stubs.**

**Full Implementation:**
1. **Dashboard**: KPIs, recent activity, quick actions
2. **Audit**: Summary, table, report drawer, filters
3. **Release**: Preview with tabs, run action
4. **Settings**: Source health, feature flags

**Stubs (navigation + empty states only):**
1. **DevLink**: Empty state with icon
2. **Mind**: Empty state with icon
3. **Analytics**: Empty state with icon

**Rationale:**
- Core workflow (Audit + Release) fully functional
- Infrastructure ready for future modules
- Shows complete vision without blocking MVP
- Easy to add modules later

## Consequences

### Positive

- Fast MVP delivery
- Core workflows work end-to-end
- Clear path to full implementation
- Doesn't block on complex features (DevLink, Mind)

### Negative

- Some navigation items lead to stubs
- Users may expect more than they get

### Alternatives Considered

- **Build all 7**: Too much work, delays MVP
- **Defer stubs**: Incomplete vision, unclear what's next
- **Only Dashboard + Audit**: Too narrow

## Implementation

- Dashboard, Audit, Release, Settings: Full pages + components
- DevLink, Mind, Analytics: `<EmptyState>` with descriptive text
- Navigation shows all 7 modules
- Feature flags can hide stub modules if needed

## References

- [MVP Scope Definition](./README.md#mvp-module-scope)

