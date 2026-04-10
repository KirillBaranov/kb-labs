# ADR-0025: Marketplace Module — Route, Card Design, Entity Model

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** Kirill Baranov
**Last Reviewed:** 2026-04-02
**Tags:** [architecture, ui/ux]

## Context

The Studio had a "Plugins" page (`/plugins`) listing installed plugins. It had several problems:

1. **Wrong name** — the concept is broader than plugins. Adapters, playbooks, and other entity types will live here too.
2. **Weak card design** — minimal card with no visual hierarchy, surface indicators, or hover interaction.
3. **No filtering** — users couldn't filter by kind (Extensions vs Adapters) or surface (CLI / Studio UI / REST).
4. **Embedded sidebar layout** — a left filter sidebar collapsed to near-nothing when the main sidebar was open, creating an awkward double-sidebar.

## Decision

### 1. Rename: plugins → marketplace

- Route: `/plugins` → `/marketplace`
- Navigation label: "Plugins" → "Marketplace"
- File: `plugins-page.tsx` → `marketplace-page.tsx`
- Navigation item key stays `'plugins'` internally for backward compat with plugin nav injection points

### 2. New card design (`marketplace-card.tsx`)

```
┌──────────────────────────────────────┐
│ [44px letter avatar]   [status badge]│
│                                      │
│ Plugin Name                          │
│ v0.1.0                               │
│                                      │
│ Description (2 lines, ellipsis)      │
│                                      │
│ [CLI] [Studio] [REST]  [⚠] [Open →] │
└──────────────────────────────────────┘
```

- **Letter avatar** — 44px square, `borderRadius: 11px`, color deterministically derived from plugin ID via `stringToColor(id)` (10-color palette, hash-based).
- **Status badge** — top-right: green "Installed" or red "Invalid" based on `plugin.validation`.
- **Surface pills** — CLI / Studio UI / REST API as colored chips, only shown if count > 0.
- **Hover Open button** — appears on hover, stops propagation.
- **Description** — `WebkitLineClamp: 2` for consistent card height.

### 3. Horizontal filter bar (top, not sidebar)

```
[All] [Extensions] [Adapters]   [CLI] [Studio UI] [REST API]   [search...]
```

- Kind tabs (All / Extensions / Adapters) as pill segment switcher (left)
- Surface chips (CLI / Studio UI / REST API) as toggle pills (center)
- Search pushed to right with `marginLeft: 'auto'`
- No embedded sidebar — avoids double-sidebar UX problem

### 4. Grid layout

3-column max: `xs={24} sm={12} xl={8}`. Chosen over 4-column because plugin names truncated at 4 columns ("Workfl...", "Relea...").

### 5. Entity model

Two first-class entity types:
- **Extensions** — plugins (`PluginManifestEntry` from marketplace.lock)
- **Adapters** — future, backed by adapter marketplace API (when backend ready)

The `/marketplace` page will evolve to show both types via kind tabs. Current implementation shows Extensions only.

## Consequences

### Positive

- Scalable to multiple entity types (adapters, playbooks, skills).
- Horizontal filters work at any sidebar width.
- Card design shows surface coverage at a glance.
- 3-column grid keeps names readable.

### Negative

- Route change (`/plugins` → `/marketplace`) breaks bookmarks. Acceptable — no external links to internal Studio routes.
- Adapter tab shows no data until backend adapter marketplace is ready.

### Alternatives Considered

- **Keep `/plugins` route** — rejected, naming matters for product positioning.
- **4-column grid** — tested, names truncated badly ("Workfl...", "Relea...").
- **Left sidebar filters** — rejected after review: double-sidebar when main nav is open.
- **Single entity type forever** — rejected, platform strategy includes adapters as marketplace entities.

## Implementation

- `apps/studio/src/modules/plugins/pages/marketplace-page.tsx` — new (replaces plugins-page.tsx)
- `apps/studio/src/modules/plugins/components/marketplace-card.tsx` — new
- `apps/studio/src/modules/plugins/routes/index.tsx` — PATHS.ROOT: '/marketplace', label: 'Marketplace'

## References

- [ADR-0022: Studio Widget System v2](./0022-studio-widget-system-v2.md) — plugin page architecture
- [ADR-0024: UIKit Page Layout System](./0024-uikit-page-layout-system.md) — UIPage used in marketplace

---

**Last Updated:** 2026-04-02
