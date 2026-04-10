# Studio Widget System — Migration Guide (V1 → V2)

## What Changed

| Before (V1) | After (V2) |
|---|---|
| Declarative JSON widgets (29 kinds) | React components via Module Federation |
| `studio-contracts` package | Deleted |
| `StudioConfig { widgets[], layouts[], menus[] }` | `StudioConfig { version: 2, remoteName, pages[], menus[] }` |
| V1 Registry (`kb.studio/1`) | V2 Registry (`kb.studio/2`) |
| `useRegistry()` from old provider | `useRegistryV2()` from `registry-v2-provider` |
| Plugin declares widget configs in JSON | Plugin ships MF remote with React pages |
| `@kb-labs/rest-api-contracts` studio re-exports | Replaced with V2 types from `plugin-contracts` |

## What Was Already Done

### Deleted
- `studio-contracts` package (entire)
- `registry-provider.tsx` (V1 provider)
- `plugin-page.tsx` (V1 plugin page renderer)
- `gallery-page.tsx` (V1 widget gallery)
- `plugins/registry.ts` (V1 HTTP loader)
- `registry-provider.spec.tsx` (V1 tests)
- All V1 widget hooks: `useWidgetData`, `useWidgetActions`, `useWidgetEventSubscription`, `useWidgetComponentLoader`, `useWidgetMutation`, `useWidgetDataMerger`, `useWidgetEvents`, `useWidgetChangeHandler`
- `action-toolbar.tsx` (V1 widget actions component)
- All `@kb-labs/studio-contracts` dependencies from every package.json

### Created
- `studio-event-bus` — EventBus singleton + React context
- `studio-hooks` — useData, useMutateData, useSSE, useInfiniteData, useWebSocket, useEventBus, usePermissions, useNavigation, useNotification, useTheme, usePage
- `studio-federation` — PageContainer, PageErrorBoundary, widget-loader, initFederation
- `studio-plugin-tools` — `kbStudioRemote()` Vite plugin for building MF remotes
- `@kb-labs/sdk/studio` — re-export barrel
- `commit-studio` — pilot MF remote plugin
- `registry-v2-provider.tsx` — V2 registry provider + MF init
- `plugin-page-v2.tsx` — dynamic MF page resolver

### Updated
- `ManifestV3.studio` — new `StudioConfig` with `version: 2`, `remoteName`, `pages[]`, `menus[]`
- `vite.config.ts` — Module Federation host
- `App.tsx` — V2 provider only
- `router.tsx` — `useRegistryV2()`, dynamic `/p/*` route, V2 nav model
- `rest-api-core/studio-registry.ts` — V2 format
- `rest-api-contracts/studio.ts` — V2 types
- `page-header.tsx` — removed V1 WidgetAction props
- `health-banner.tsx`, `dashboard-kpis-widget.tsx`, `settings-page.tsx`, `plugin-page.tsx`, `command-palette-provider.tsx` — migrated to `useRegistryV2()`

---

## What Still Needs Migration

### 1. Hardcoded Plugin Modules → MF Remote Pages

These modules in `apps/studio/src/modules/` are still hardcoded inside Studio. Each should be extracted to its respective plugin as an MF remote page.

| Module | Target Plugin | Priority |
|--------|--------------|----------|
| `modules/commit/` | `plugins/kb-labs-commit-plugin/packages/commit-studio/` | High (pilot ready) |
| `modules/quality/` | `plugins/kb-labs-quality-plugin/packages/quality-studio/` | Medium |
| `modules/qa/` | `plugins/kb-labs-qa-plugin/packages/qa-studio/` | Medium |
| `modules/release/` | `plugins/kb-labs-release-manager/packages/release-studio/` | Medium |
| `modules/agents/` | `plugins/kb-labs-agents/packages/agents-studio/` | Low |

**Core modules that stay in Studio (not plugins):**
- `modules/dashboard/` — core Studio dashboard
- `modules/workflows/` — workflow engine UI
- `modules/analytics/` — platform analytics
- `modules/observability/` — logs, metrics, incidents
- `modules/settings/` — Studio settings
- `modules/plugins/` — plugin management UI

### 2. REST API Registry Endpoint

The REST API `GET /api/v1/studio/registry` route handler needs to use the updated `combineManifestsToRegistry()` from `rest-api-core/studio-registry.ts`. It now expects `Array<{ manifest, resolvedPath? }>` instead of just `ManifestV3[]`.

### 3. Gateway Static File Serving

Gateway needs a route to serve plugin widget bundles from `node_modules`:
```
GET /plugins/:scope/:name/widgets/*
  → node_modules/@scope/name/dist/widgets/*
```

### 4. Health Status

`health-banner.tsx` and `dashboard-kpis-widget.tsx` previously got health data from the V1 registry provider's SSE integration. This needs to be replaced with a dedicated health endpoint or SSE channel. Currently hardcoded to `null`.

---

## How to Migrate a Module to a Plugin Page

### Step 1: Create pages package in the plugin

```bash
mkdir -p plugins/kb-labs-{plugin}/packages/{plugin}-studio/src/pages
```

Create `package.json`, `tsconfig.json`, `vite.config.ts`. Use `kbStudioRemote()` from `@kb-labs/studio-plugin-tools`.

Example vite.config.ts:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { kbStudioRemote } from '@kb-labs/studio-plugin-tools';

export default defineConfig({
  plugins: [
    react(),
    kbStudioRemote({
      name: '{pluginName}Plugin',
      exposes: {
        './Overview': './src/pages/Overview.tsx',
      },
    }),
  ],
  server: { port: 3010 }, // Each plugin gets its own dev port
  build: { target: 'esnext', outDir: 'dist/widgets' },
});
```

### Step 2: Move the React component

Copy the page component from `apps/studio/src/modules/{module}/pages/` to the plugin's `pages/` directory.

Replace imports:
```diff
- import { useRegistry } from '../../../providers/registry-provider';
- import { useDataSources } from '../../../providers/data-sources-provider';
+ import { useData, usePermissions, useNotification } from '@kb-labs/sdk/studio';
```

Replace data fetching:
```diff
- const sources = useDataSources();
- const { data } = useQuery({ queryFn: () => sources.commit.getHistory() });
+ const { data } = useData('/v1/plugins/commit/history');
```

### Step 3: Update the plugin manifest

Add `studio` section to the plugin's manifest:
```typescript
studio: {
  version: 2 as const,
  remoteName: '{pluginName}Plugin',
  pages: [
    { id: '{plugin}.overview', title: 'Overview', route: '/p/{plugin}', entry: './Overview' }
  ],
  menus: [
    { id: '{plugin}', label: '{Plugin}', icon: 'IconName', target: '{plugin}.overview' }
  ]
}
```

### Step 4: Remove from Studio

1. Delete `apps/studio/src/modules/{module}/`
2. Remove the hardcoded route from `router.tsx`
3. Remove the hardcoded navigation item from `LayoutContent`
4. Remove the import at the top of `router.tsx`

### Step 5: Build and test

```bash
# Build the plugin pages
cd plugins/kb-labs-{plugin}/packages/{plugin}-studio
pnpm build

# Or dev mode
pnpm dev  # Starts MF remote on its port

# Start Studio
cd platform/kb-labs-studio/apps/studio
pnpm dev  # Navigate to /p/{plugin} — should load from MF remote
```

---

## Cleanup Checklist (after all 5 plugin modules migrated)

- [ ] Delete `apps/studio/src/modules/commit/`
- [ ] Delete `apps/studio/src/modules/quality/`
- [ ] Delete `apps/studio/src/modules/qa/`
- [ ] Delete `apps/studio/src/modules/release/`
- [ ] Delete `apps/studio/src/modules/agents/`
- [ ] Remove all hardcoded plugin routes from `router.tsx`
- [ ] Remove all hardcoded plugin nav items from `LayoutContent`
- [ ] Fix health status source for `health-banner.tsx` and `dashboard-kpis-widget.tsx`

## Known Issues

- **`@module-federation/vite` v1.13+** — requires `@module-federation/runtime` v2.3+. Versions were corrected from initial `^0.8.0`.
- **TS 5.9 override requirements** — class components extending `React.Component` need `override` on `state`, `componentDidCatch`, `render`. Static methods like `getDerivedStateFromError` do NOT use `override`.
- **Health data** — previously came from V1 registry SSE. Currently `null` in `health-banner.tsx` and `dashboard-kpis-widget.tsx`. Needs dedicated health endpoint.
