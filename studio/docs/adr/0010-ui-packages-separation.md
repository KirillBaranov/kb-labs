# ADR-0010: UI Packages Separation

**Date:** 2025-11-01
**Status:** Superseded by [ADR-0024](./0024-uikit-page-layout-system.md)
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-02
**Tags:** [architecture, ui/ux]

## Context

Studio needs a component library. We considered:
- Single `ui` package vs separate packages
- What goes into shared UI vs Studio-specific components
- Future extraction to separate `@kb-labs/ui` package

Goal: Build reusable components now while keeping Studio-specific ones isolated.

## Decision

**Separate UI into three packages:**

1. **`packages/ui-core`**: Framework-agnostic design tokens and themes
   - Design tokens (colors, spacing, typography, radius, shadows)
   - Theme system (light/dark)
   - CSS variable generation utilities
   - No framework dependencies

2. **`packages/ui-react`**: Shared generic React components
   - KB-prefixed components wrapping shadcn/ui
   - Business-agnostic components (StatCard, DataTable, EmptyState)
   - Only generic, reusable components
   - Framework-specific (React)

3. **`apps/studio/src/components`**: Studio-specific components only
   - RunBadge, HealthIndicator, StudioNav
   - Domain-specific components
   - NOT meant for extraction

**Principle: Generic vs Domain separation**
- `ui-react` → future `@kb-labs/ui` package
- Studio components → stay in Studio

## Consequences

### Positive

- Clear separation of concerns
- Easy future extraction of `ui-react` to standalone package
- Framework-agnostic tokens in `ui-core` can be reused across frameworks
- Keeps Studio-specific code isolated

### Negative

- Three packages to maintain
- Requires discipline to keep components in right package
- Slightly more complex imports initially

### Alternatives Considered

- **Single `ui` package**: Harder to extract generic vs domain-specific later
- **Component library outside monorepo**: Loses code-sharing benefits
- **All in Studio**: No reusability, hard to share later

## Implementation

- `ui-core`: Design tokens + themes, no React
- `ui-react`: Generic React components, depends on `ui-core`
- Studio imports from both for maximum reuse
- Future: Extract `ui-react` to `@kb-labs/ui` for ecosystem-wide use

## References

- [KB Labs Shared UI Strategy](../../kb-labs/docs/adr/)
- [Component Organization Guidelines](../CONTRIBUTING.md)

