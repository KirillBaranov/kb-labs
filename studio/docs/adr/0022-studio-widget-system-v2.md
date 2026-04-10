# ADR-0022: Studio Widget System v2 — Module Federation Pages

- **Status:** Accepted
- **Date:** 2026-04-01
- **Decision Makers:** Kirill Baranov

## Context

Studio's widget system (v1) uses a purely declarative JSON approach: plugins describe UI via 29 widget kinds (`metric`, `table`, `chart-*`, `form`, `select`, etc.) in ManifestV3's `StudioConfig`. Each widget is a JSON object with `kind`, `data.source`, `options`, `actions`, `events`, `layoutHint`, and `visibility`.

**Problems with v1:**

1. **No conditionals or logic** — rendering is static JSON, no `if/else`, no state, no effects.
2. **No custom rendering** — can't customize table cells, add inline components, compose freely.
3. **No real components** — everything is a config object, not a React component.
4. **Painful DX** — describing complex UIs as deeply nested JSON is error-prone and unreadable.
5. **Hardcoded modules** — Studio app has 12 hardcoded modules (`modules/agents/`, `modules/commit/`, etc.) that bypass the widget system entirely because it's too limited.
6. **29 widget kinds are insufficient** — every new UI pattern requires adding a new widget kind to the contract.

## Decision

Replace the declarative widget system with a **Module Federation-based page system** where plugins ship real React components.

### Core Architecture

```
Plugin (MF Remote)                    Studio (MF Host)
┌─────────────────────┐              ┌──────────────────────┐
│ CommitOverview.tsx   │  loadRemote  │ PageContainer        │
│ CommitHistory.tsx    │◄────────────│   ├ ErrorBoundary     │
│                     │              │   ├ PageContext       │
│ import { useData,   │              │   └ EventBusScope     │
│   Table, Button }   │              │                      │
│ from '@kb-labs/      │              │ Registry → Routes    │
│       sdk/studio'   │              │ Menus → Sidebar      │
└─────────────────────┘              └──────────────────────┘
         │                                     │
         └──── shared: react, antd, sdk ───────┘
                   (singleton, one copy)
```

### Key Decisions

**1. Pages, not widgets.**

Plugin declares pages. Each page = one MF exposed React component. Plugin is full owner inside the page — UIKit, own components, any composition. No layout hints, no grid positioning, no widget kind constraints.

**2. Module Federation for isolation.**

`@module-federation/vite` — plugins build their own Vite bundles as MF remotes. Studio is the host. React, react-dom, antd, @ant-design/icons, @tanstack/react-query, zustand, and SDK hooks are `shared` with `singleton: true` — one copy loaded by the host.

**3. UIKit + hooks in studio packages, re-exported via `@kb-labs/sdk/studio`.**

All logic lives in studio packages (`studio-hooks`, `studio-event-bus`, `studio-ui-kit`, `studio-ui-core`). `@kb-labs/sdk` adds a `./studio` subpath that re-exports everything. Plugin author has one import:

```typescript
import { useData, usePermissions, Table, Button, PageLayout } from '@kb-labs/sdk/studio';
```

**4. Frontend never leaves origin.**

All HTTP requests go through Gateway (:4000) `/api/v1/*`. If a plugin needs external data, it declares a REST route in its manifest — backend fetches externally, frontend reads its own endpoint. No CORS, no token leakage.

**5. Permissions: page-level + atomic.**

- Page-level: Studio host checks permissions before loading MF remote. No permission → not in menu, route returns 403, bundle never fetched.
- In-page: `usePermissions()` hook for fine-grained control (hide buttons, readonly mode).

**6. Widget bundles served from node_modules.**

No CDN, no marketplace static file serving. Plugin's `dist/widgets/remoteEntry.js` lives in `node_modules` alongside its CLI/REST code. Gateway serves them:

```
GET /plugins/@kb-labs/commit/widgets/remoteEntry.js
  → node_modules/@kb-labs/commit/dist/widgets/remoteEntry.js
```

Registry endpoint computes URL from `resolvedPath` in marketplace.lock. No version drift — bundle always matches installed version. In dev — plugin runs its own Vite dev server with HMR.

**7. EventBus for cross-plugin communication.**

`StudioEventBus` singleton with `publish/subscribe` pattern. Events are namespaced (`pluginId:eventName`). Auto-cleanup on unmount. History buffer for devtools. Isolated — plugins communicate through events, not shared state.

### New Manifest Format

```typescript
// ManifestV3.studio field (discriminated by version)
interface StudioConfigV2 {
  version: 2;
  remoteName: string;           // 'commitPlugin'
  pages: StudioPageEntry[];
  menus?: StudioMenuEntry[];
}

interface StudioPageEntry {
  id: string;                   // 'commit.overview'
  title: string;
  icon?: string;
  route: string;                // '/commit'
  entry: string;                // './CommitOverview'
  permissions?: string[];
  order?: number;
}

interface StudioMenuEntry {
  id: string;
  label: string;
  icon?: string;
  target: string;               // page ID
  order?: number;
  parentId?: string;
  permissions?: string[];
  badge?: string;
}
```

### New Package Structure

| Package | Purpose |
|---------|---------|
| `studio-hooks` | SDK hooks: useData, useMutateData, useSSE, useInfiniteData, useWebSocket, useEventBus, usePermissions, useNavigation, useNotification, useTheme, usePage |
| `studio-event-bus` | StudioEventBus singleton, React context, types |
| `studio-federation` | Host-side MF logic: PageContainer, widget-loader, ErrorBoundary, PageContext |
| `studio-plugin-tools` | Vite plugin (`kbStudioRemote()`) for building MF remotes, dev harness |
| `studio-ui-kit` | UIKit components (keep, evolve) |
| `studio-ui-core` | Design tokens, CSS vars (keep) |
| `studio-data-client` | HTTP client, TanStack Query hooks (keep, wrap in studio-hooks) |

**Deleted:** `studio-contracts` (old 29-widget declarative types).

### Plugin Author Workflow

```bash
# 1. Scaffold (one-time)
npx kb-studio-init --plugin my-plugin

# 2. Write pages — normal React
# src/pages/MyDashboard.tsx
import { useData, Table, PageLayout } from '@kb-labs/sdk/studio';

export default function MyDashboard() {
  const { data } = useData('/v1/plugins/my-plugin/data');
  return <PageLayout title="Dashboard"><Table data={data} /></PageLayout>;
}

# 3. Declare in manifest (5 lines)
# studio: { version: 2, remoteName: 'myPlugin', pages: [...], menus: [...] }

# 4. Dev
pnpm dev:pages  # Vite HMR on :3010, Studio loads it on :3000
```

## Consequences

### Positive

- **Full React power** — conditionals, state, effects, custom components, composition.
- **Great DX** — write normal React, use UIKit components, one SDK import.
- **Isolation** — plugin crash doesn't affect host or other plugins (ErrorBoundary).
- **Shared deps** — one React, one antd across all plugins (MF singleton).
- **No version drift** — bundles from node_modules, always match installed version.
- **Security** — origin-only requests, permission gates before bundle load.
- **Incremental migration** — old hardcoded modules coexist with new MF pages.

### Negative

- **React required** — plugin authors must know React. Intentional trade-off: no framework zoo.
- **Two dev servers** — host + remote in development. Mitigated by standalone dev harness.
- **MF complexity** — Module Federation adds build complexity. Mitigated by `studio-plugin-tools`.
- **No cross-plugin widget embedding** — plugins own pages, can't embed into each other. By design — plugins are isolated units.
- **Bundle size per plugin** — each plugin ships its own chunk (50-200KB gzipped typical). Shared deps not duplicated.

### Supersedes

- ADR-0017 (Widget Registry Phased) — phased approach for v1 widgets, no longer relevant.
- ADR-0019 (Registry Flatten in Provider) — v1 registry format replaced by V2.
- ADR-0020 (Declarative Event-to-Params Mapping) — replaced by EventBus pub/sub.
- ADR-0021 (Action Conditional Visibility) — replaced by React conditionals in components.
