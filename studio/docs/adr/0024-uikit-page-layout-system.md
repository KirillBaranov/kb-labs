# ADR-0024: UIKit Page Layout System — UIPage, UIPageHeader, UIPageSection, UICard Status

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** Kirill Baranov
**Last Reviewed:** 2026-04-02
**Tags:** [architecture, ui/ux]

## Context

Studio had three page layout components — `KBPageContainer`, `KBPageHeader`, `KBSection` — living only in `apps/studio/src/components/ui/`. Plugins could not access them, forcing every plugin to either copy the styles or build custom wrappers.

Additionally, `UICard` had no way to express semantic status (success / warning / error / info), making dashboard cards visually flat with no hierarchy.

**Problems:**

1. `KB*` components are inaccessible to plugins — wrong layer.
2. `KB*` had hardcoded colors (`color: '#666'`) instead of design tokens.
3. `KBPageHeader` lacked `actions`, `icon`, `breadcrumbs`, `back`, `tabs` support.
4. `UICard` had no colored variant — all cards looked identical regardless of health state.
5. `UICardProps` couldn't be extended due to name collision with Ant Design's own `variant` prop.

## Decision

### 1. Move page layout into `@kb-labs/studio-ui-kit`

Add three new components to `packages/studio-ui-kit/src/composite/`:

**`UIPage`** — page-level wrapper
```tsx
interface UIPageProps {
  children: React.ReactNode;
  variant?: 'default' | 'document'; // default = transparent, document = white card
  width?: 'default' | 'wide' | 'full'; // 1280px | 1600px | 100%
  noPadding?: boolean;
}
```

**`UIPageHeader`** — page title block with full action support
```tsx
interface UIPageHeaderProps {
  title: string | React.ReactNode;
  description?: string | React.ReactNode;
  icon?: React.ReactNode;
  breadcrumbs?: Array<{ title: string; href?: string }>;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  onBack?: () => void;
  children?: React.ReactNode;
}
```

**`UIPageSection`** — vertical spacing wrapper
```tsx
interface UIPageSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  gap?: number; // marginBottom, default 24
}
```

### 2. Add `status` prop to `UICard`

Renamed from `variant` (which conflicts with Ant Design's `variant: "borderless" | "outlined"`) to `status`.

```tsx
type UICardVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface UICardProps {
  status?: UICardVariant;
  // ...existing props
}
```

Each status adds a 3px colored top border and a subtle tinted background:

| Status | Accent | Tint |
|--------|--------|------|
| `success` | `#52c41a` | `rgba(82,196,26,0.07)` |
| `warning` | `#faad14` | `rgba(250,173,20,0.08)` |
| `error` | `#ff4d4f` | `rgba(255,77,79,0.07)` |
| `info` | `#0c66ff` | `rgba(12,102,255,0.07)` |
| `default` | none | none (preserves Ant Design white bg) |

**Critical implementation detail:** `backgroundColor` must be `undefined` (not `'transparent'`) for `default` status to preserve Ant Design's `colorBgContainer` white background.

### 3. Width strategy for Studio pages

- `width="full"` — dashboards, analytics, data-heavy list pages
- `width="default"` (1280px) — detail pages, modals-in-page
- `variant="document"` — settings-style linear content (white card wrapper)

### 4. Delete `KB*` from `apps/studio`

`KBPageContainer`, `KBPageHeader`, `KBSection` deleted from `apps/studio/src/components/ui/`. All 27 Studio pages migrated to `UIPage`/`UIPageHeader`/`UIPageSection` from `@kb-labs/studio-ui-kit`.

## Consequences

### Positive

- Plugins can use `UIPage`, `UIPageHeader`, `UIPageSection` — identical layout to core Studio pages.
- `UICard status` provides semantic hierarchy out of the box for all consumers.
- No more hardcoded colors in layout components — all via `useToken()`.
- Single source of truth for page layout across Studio + all plugins.

### Negative

- All 27 pages required a migration pass (one-time cost).
- `UICardVariant` type name is slightly confusing given it maps to a `status` prop — but necessary to avoid Ant Design prop collision.

### Alternatives Considered

- **Keep KB* in studio, expose via re-export** — doesn't work for plugins (different bundle scope).
- **Use raw `<div>` with inline styles for card status** — rejected as "костыль" (hack). Proper `status` prop on UICard is the right abstraction.
- **Add `variant` to UICard** — conflicts with Ant Design Card's own `variant` prop, causing TypeScript errors.

## Implementation

1. `packages/studio-ui-kit/src/composite/UIPage.tsx` — new
2. `packages/studio-ui-kit/src/composite/UIPageHeader.tsx` — new
3. `packages/studio-ui-kit/src/composite/UIPageSection.tsx` — new
4. `packages/studio-ui-kit/src/composite/index.ts` — add exports
5. `packages/studio-ui-kit/src/core/UICard.tsx` — add `status` prop
6. `apps/studio/src/components/ui/kb-page-container.tsx` — deleted
7. `apps/studio/src/components/ui/kb-page-header.tsx` — deleted
8. `apps/studio/src/components/ui/kb-section.tsx` — deleted
9. All 27 Studio pages — KB* → UI* migration

## References

- [ADR-0010: UI Packages Separation](./0010-ui-packages-separation.md) — original package split
- [ADR-0022: Studio Widget System v2](./0022-studio-widget-system-v2.md) — plugin page architecture

---

**Last Updated:** 2026-04-02
