# ADR-0018: Ant Design Migration

**Date:** 2025-01-27
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-03
**Tags:** [ui/ux, architecture]  
**Supersedes:** [ADR-0013: Shadcn Adapter Pattern](./0013-shadcn-adapter-pattern.md)

## Context

KB Labs Studio is a large-scale project requiring extensive UI components:
- Multiple analytics dashboards
- Complex data tables with filtering, sorting, pagination
- Configuration management UIs
- Tree-based data structures
- Forms with validation
- Various data visualization needs

**Problem with previous approach (shadcn/ui + Radix UI):**

While ADR-0013 established a good pattern with KB-prefixed wrappers, the underlying library (shadcn/ui + Radix UI) provides only basic primitives. For complex components like:
- **Table** with filtering, pagination, virtualization → **15-23 days** to implement from scratch
- **Form** with validation, nested fields → **11-18 days** to implement from scratch
- **DatePicker**, **Tree**, **Upload** → **5-10 days each** to implement from scratch

Total estimated development time for 6 complex components: **49-78 days** vs **7-11 days** to migrate and use ready-made Ant Design components.

**Constraints:**
- Need to maintain `ui-core` as framework-agnostic for future flexibility
- Priority on **speed of development** over deep customization
- Solo developer maintaining the entire ecosystem
- Need to support rapid feature development

## Decision

**Migrate to Ant Design React with KB-prefixed wrappers, preserving `ui-core` framework-agnostic nature.**

Key aspects:

1. **Full Ant Design migration**
   - Replace all shadcn/ui + Radix UI components with Ant Design
   - Create KB-prefixed wrappers over Ant Design components
   - Maintain consistent API where possible

2. **Preserve `ui-core` independence**
   - `ui-core` remains framework-agnostic (no React/Ant Design dependencies)
   - Create theme adapter to read CSS variables from `ui-core` and convert to Ant Design tokens
   - Allows future migration to Vue/Angular/other frameworks

3. **Use Ant Design Layout components**
   - `KBPageLayout` using Ant Design `Layout` (Header + Sider + Content)
   - `KBHeader` with logo, theme toggle, profile dropdown
   - `KBSidebar` with Ant Design `Menu` supporting subItems (nested navigation)
   - Breadcrumb on all pages with nested structure

4. **Component structure**
   - All components prefixed with `KB` (KBButton, KBCard, KBTabs, etc.)
   - Wrappers maintain similar API where possible for easier migration
   - Studio imports only from `@kb-labs/ui-react`, never directly from `antd`

5. **Theme integration**
   - `KBConfigProvider` wraps Ant Design `ConfigProvider`
   - Theme adapter reads CSS variables from `ui-core`
   - Supports light/dark/auto theme modes

**Example:**
```tsx
// packages/ui-react/src/components/kb-button.tsx
import { Button } from 'antd';
import type { ButtonProps } from 'antd';

export function KBButton({ variant, size, ...props }: KBButtonProps) {
  return <Button type={variant} size={size} {...props} />;
}

// apps/studio
import { KBButton } from '@kb-labs/ui-react'
```

## Consequences

### Positive

1. **Development speed**
   - Complex components ready out of the box (Table, Form, DatePicker, Tree, etc.)
   - Estimated savings: **38-67+ days** on first 6 complex components
   - Can focus on business logic instead of UI component implementation

2. **Feature completeness**
   - Rich component library with advanced features
   - Well-tested components with edge cases handled
   - Regular updates and new features from Ant Design team

3. **Professional appearance**
   - Consistent, polished design out of the box
   - Good typography and spacing
   - Suitable for enterprise applications

4. **Maintainability for solo developer**
   - Instead of maintaining complex component implementations → maintain simple wrappers
   - Core functionality maintained by Ant Design team
   - Less custom code to debug and fix

5. **Preserved flexibility**
   - `ui-core` remains framework-agnostic
   - Theme adapter allows integration without coupling
   - Can migrate to other frameworks in the future if needed

### Negative

1. **Bundle size**
   - Ant Design is larger (~440-660KB) vs previous approach (~90-140KB)
   - Requires tree-shaking configuration
   - Can impact initial load time

2. **Dependency on Ant Design**
   - Breaking changes in Ant Design may require wrapper updates
   - Less control over internal implementation
   - Need to keep wrappers in sync with Ant Design updates

3. **Customization complexity**
   - Ant Design uses token-based theming (different from CSS variables)
   - Requires adapter layer for `ui-core` integration
   - Some customization may be more complex than pure CSS

4. **Wrapper maintenance**
   - Need to maintain KB wrappers
   - API compatibility layer adds complexity
   - Updates to Ant Design require wrapper updates

5. **Learning curve**
   - Team needs to learn Ant Design patterns
   - Different from previous shadcn/ui approach
   - Documentation and examples follow Ant Design conventions

## Alternatives Considered

### Alternative 1: Continue with shadcn/ui + Radix UI

**Rejected because:**
- Would require implementing complex components from scratch (Table, Form, DatePicker, etc.)
- Estimated 49-78+ days of development time
- Too much effort for solo developer
- Doesn't align with priority on development speed

### Alternative 2: Use Ant Design directly without wrappers

**Rejected because:**
- Loses consistency (KB-prefixed naming)
- Makes future migration harder
- No abstraction layer for customizations
- Direct dependency in Studio code

### Alternative 3: Hybrid approach (shadcn for basic, Ant Design for complex)

**Rejected because:**
- Two different styling systems to maintain
- Potential conflicts between Tailwind and Ant Design styles
- Inconsistent developer experience
- More complex to support

### Alternative 4: Other UI libraries (MUI, Chakra UI)

**Rejected because:**
- Ant Design has excellent component coverage
- Good documentation and community support
- Better suited for enterprise/admin applications
- More mature Table and Form components

## Implementation

### Phase 1: Infrastructure (Completed)
- ✅ Install Ant Design and icons
- ✅ Remove old Radix UI dependencies
- ✅ Create theme adapter (`theme-adapter.ts`)
- ✅ Create `KBConfigProvider` wrapper

### Phase 2: Layout Components (Completed)
- ✅ `KBHeader` with logo, theme toggle, profile
- ✅ `KBSidebar` with Ant Design Menu
- ✅ `KBContent`, `KBPageLayout`
- ✅ `KBBreadcrumb` for nested navigation

### Phase 3: Basic Components (Completed)
- ✅ `KBButton`, `KBCard`, `KBBadge`, `KBGrid`
- ✅ `KBSkeleton`, `KBTabs`, `KBDataList`, `KBDataTable`
- ✅ `KBStack`, `KBSection`, `KBInfoPanel`
- ✅ `KBStatCard`, `KBStatGrid`
- ✅ `KBSheet` (Drawer wrapper)

### Phase 4: Page Components (Completed)
- ✅ `KBPageContainer`, `KBPageHeader`
- ✅ `KBThemeToggle` with Light/Dark/Auto options

### Phase 5: Application Migration (Completed)
- ✅ Updated `App.tsx` to use `KBConfigProvider`
- ✅ Updated `router.tsx` to use `KBPageLayout`
- ✅ Migrated all pages (Dashboard, Audit, Release, Settings, etc.)
- ✅ Updated all components to use new KB components

### Architecture

```
┌─────────────────────────────────────────┐
│         apps/studio                      │
│  (uses only @kb-labs/ui-react)          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│      @kb-labs/ui-react                   │
│  ┌────────────────────────────────┐     │
│  │ KB Components (wrappers)       │     │
│  │ - KBButton, KBCard, KBTabs...  │     │
│  │ - KBPageLayout, KBHeader...    │     │
│  └──────────────┬─────────────────┘     │
│                 │                        │
│  ┌──────────────▼─────────────────┐     │
│  │ Theme Adapter                   │     │
│  │ (reads ui-core CSS vars)        │     │
│  └─────────────────────────────────┘     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         antd (Ant Design)                │
│  (Layout, Button, Card, Table, etc.)     │
└──────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│      @kb-labs/ui-core                   │
│  (framework-agnostic tokens & themes)   │
│  ✅ Preserved for future flexibility     │
└──────────────────────────────────────────┘
```

## Migration Notes

- All old shadcn/ui components removed
- `ui-core` preserved unchanged (framework-agnostic)
- Theme adapter bridges `ui-core` CSS variables with Ant Design tokens
- KB components maintain similar API where possible for easier migration
- Studio code updated to use new KB components
- Breadcrumb added to all pages with nested navigation

## Future Considerations

1. **Component additions**
   - Add more Ant Design components as KB wrappers when needed
   - Table, Form, DatePicker, Tree, etc. are ready to wrap when needed

2. **Theme customization**
   - Enhance theme adapter if more fine-grained control needed
   - Consider token customization if brand requirements change

3. **Performance**
   - Monitor bundle size
   - Optimize tree-shaking if needed
   - Consider code splitting for large components

4. **Alternative frameworks**
   - `ui-core` remains available for Vue/Angular migration if needed
   - Theme adapter pattern can be replicated for other frameworks

## References

- [ADR-0013: Shadcn Adapter Pattern](./0013-shadcn-adapter-pattern.md) - Superseded by this ADR
- [ADR-0010: UI Packages Separation](./0010-ui-packages-separation.md) - UI package architecture
- [Ant Design React Documentation](https://ant.design/docs/react/introduce)
- [Ant Design Migration Analysis](../ANT_DESIGN_MIGRATION_ANALYSIS.md) - Detailed analysis document

