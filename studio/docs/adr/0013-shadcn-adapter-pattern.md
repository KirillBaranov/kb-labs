# ADR-0013: Shadcn Adapter Pattern

**Date:** 2025-11-01
**Status:** Superseded by [ADR-0018: Ant Design Migration](./0018-ant-design-migration.md)
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [ui/ux, architecture]

## Context

Studio needs UI components. We considered:
- Use shadcn/ui directly vs wrap it
- Build custom components from scratch
- Other UI libraries (MUI, Ant Design, Chakra)

Goal: Avoid library lock-in, keep swap option.

## Decision

**Wrap shadcn/ui in thin KB-prefixed adapters.**

Key aspects:
1. **Wrap and export as KB components**: `<KBButton>`, `<KBCard>`, etc.
2. **Keep shadcn internals**: Use Radix UI primitives under the hood
3. **No direct shadcn imports in Studio**: Only import from `@kb-labs/ui-react`
4. **Easy swap path**: Change implementation, keep API
5. **Design tokens**: Use `ui-core` tokens via CSS variables

**Example:**
```tsx
// packages/ui-react/src/components/kb-button.tsx
import * as ButtonPrimitive from '@radix-ui/react-slot'
// ... wrap and export as KBButton

// apps/studio
import { KBButton } from '@kb-labs/ui-react'
```

## Consequences

### Positive

- No direct library dependency in Studio
- Easy to swap shadcn for other library later
- Consistent naming (all KB-prefixed)
- Can customize without modifying upstream
- Clean public API

### Negative

- Extra layer of abstraction
- Slightly more code to maintain
- Need to keep wrappers in sync

### Alternatives Considered

- **Use shadcn directly**: Library lock-in, harder to swap
- **Build from scratch**: Too much work, reinvent wheel
- **Other libraries**: Higher bundle size, less flexibility

## Implementation

- All shadcn components wrapped in `packages/ui-react/src/components/kb-*.tsx`
- Exported as KB-prefixed names
- Studio imports only from `@kb-labs/ui-react`
- Future swap: Change internal implementation, API stays same

## References

- [Shadcn/ui Documentation](https://ui.shadcn.com/)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)

