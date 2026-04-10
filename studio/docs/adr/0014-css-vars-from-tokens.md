# ADR-0014: CSS Variables from Design Tokens

**Date:** 2025-11-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [ui/ux, architecture]

## Context

Studio needs a theming system. We considered:
- Tailwind classes only vs CSS variables
- Hardcoded values vs design tokens
- Theme generation approach

Goal: Support light/dark themes, keep design system consistent.

## Decision

**Generate CSS custom properties from design tokens.**

Key aspects:
1. **Design tokens in TypeScript**: Defined in `packages/ui-core/src/tokens/`
2. **CSS variable generator**: Convert tokens → `:root[data-theme="light|dark"]`
3. **Tailwind reads CSS vars**: Config uses CSS variables as values
4. **Runtime theme switching**: Change `data-theme` attribute, CSS updates
5. **No JS theme injection**: Pure CSS-based theming

**Structure:**
```
ui-core/
  tokens/
    colors.ts    → semantic palette
    spacing.ts   → scale
    typography.ts
    ...
  themes/
    light.ts     → theme mapping
    dark.ts
    
utils/
  css-vars.ts    → token → CSS var converter
  theme-script.ts → generate :root styles
```

## Consequences

### Positive

- Single source of truth (design tokens)
- Runtime theme switching via `data-theme`
- No CSS-in-JS runtime cost
- Framework-agnostic tokens
- Type-safe token references

### Negative

- Need to maintain generator
- Initial setup complexity

### Alternatives Considered

- **CSS-in-JS**: Runtime overhead, harder to extract
- **Tailwind classes only**: No runtime theming
- **Hardcoded values**: No single source of truth

## Implementation

- Tokens: `packages/ui-core/src/tokens/*.ts`
- Themes: `packages/ui-core/src/themes/*.ts`
- CSS generator: `packages/ui-core/src/utils/css-vars.ts`
- Tailwind: Reads CSS vars via config
- Theme toggle: Updates `data-theme` attribute

## References

- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
- [Design Tokens Specification](https://tr.designtokens.org/)

