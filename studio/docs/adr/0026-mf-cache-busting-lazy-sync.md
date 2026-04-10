# ADR-0026: Module Federation Cache Busting via mtime + Lazy Remote Sync

**Date:** 2026-04-05
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-05
**Tags:** [module-federation, studio, plugins, caching, dx]

## Context

Studio loads plugin UI via Module Federation. Each plugin exposes a `remoteEntry.js`
bundle served at a static path:

```
/plugins/{pluginId}/widgets/remoteEntry.js
```

The URL never changes between builds, so the browser and MF runtime cache the old
bundle indefinitely. After a plugin rebuild the developer had to do a hard reload
(Cmd+Shift+R) to see changes — and even then the MF runtime's internal module cache
could serve the stale version.

Two additional constraints shaped the solution:

1. **No live updates on the active page.** The registry is re-fetched every 10 s in the
   background. Updating a remote _in the background_ would swap out JS modules from
   under a running page, causing unpredictable UI state. Updates should only take
   effect when the user navigates to a page.

2. **Full page reload is the last resort.** `init()` in `@module-federation/runtime`
   is designed to be called once. Re-calling it for an already-initialized runtime
   has no effect on remotes that were registered in the first call. A new API —
   `registerRemotes({ force: true })` — re-registers a specific remote with a new
   entry URL without re-initializing the entire runtime.

### Alternatives considered

| Option | Why rejected |
|--------|-------------|
| **Hashed filename** (`remoteEntry.[hash].js`) | Requires the gateway's static file server to discover the new filename on every request; complicates the known-path contract used by the gateway proxy. |
| **Re-run `init()` on every registry refetch** | `init()` is idempotent for the host name but does not update already-registered remotes. The second call is effectively a no-op — bundle URL is not updated. |
| **Background `registerRemotes`** on every registry poll | Updates the MF runtime while a plugin page is mounted, potentially swapping the module mid-session. Violates constraint 1. |
| **Manual reload prompt** | Poor DX — requires user action even for trivial UI changes during development. |

## Decision

### 1. Server-side: mtime-based cache buster in `remoteEntryUrl`

`manifestToRegistryEntry` in `rest-api-core/src/studio-registry.ts` appends the
modification time of `remoteEntry.js` as a query parameter:

```
/plugins/{pluginId}/widgets/remoteEntry.js?v=<mtimeMs>
```

`statSync` is called at registry request time (not at server start), so the value
is always fresh. If the file does not exist yet `v=0` is used as a safe fallback.

Every plugin rebuild changes `mtime` → the URL changes → MF runtime treats it as a
different entry → fetches the new bundle on the next `loadRemote()` call.

### 2. Studio: one-time `init()`, lazy `syncRemoteEntry()` on navigation

**`widget-loader.ts`** tracks the last known `remoteEntryUrl` per `remoteName` in a
module-level `Map`. Two exported functions:

- **`initFederation(plugins)`** — called once when the registry is first loaded.
  Calls `init()` and populates the map. Subsequent calls are no-ops.

- **`syncRemoteEntry(remoteName, currentEntryUrl)`** — checks whether the URL for
  a remote changed since it was last registered. If yes, calls
  `registerRemotes([{ name, entry }], { force: true })` and updates the map.
  This re-registers only the affected remote; other remotes and the running page
  are not touched.

**`page-container.tsx`** — accepts a new optional `remoteEntryUrl` prop and passes
it to `loadPageComponent()`. `loadPageComponent` calls `syncRemoteEntry` before the
first `loadRemote()` attempt. Since `PageContainer` mounts on navigation, the check
happens exactly when the user arrives at a page — never in the background.

**`registry-v2-provider.tsx`** — `initFederation` is still guarded by a
`federationInitialized` ref so it is called only once (on first successful registry
fetch).

### Flow

```
plugin rebuild
    ↓  mtime changes
REST API /studio/registry
    ↓  returns remoteEntryUrl with new ?v=<mtime>
Studio registry refetch (every 10 s)
    ↓  React Query updates `data` in memory
    ↓  initFederation() → no-op (already initialized)
user navigates to plugin page
    ↓  PageContainer mounts
    ↓  loadPageComponent(remoteName, entry, remoteEntryUrl)
    ↓  syncRemoteEntry: URL changed → registerRemotes({ force: true })
    ↓  loadRemote() → fetches fresh bundle
    ✓  page renders with new code
```

## Consequences

### Positive

- Developer sees updated plugin UI on the **next navigation** to that page — no
  manual reload needed in most cases.
- Running pages are **never disrupted** mid-session; the update is strictly
  navigation-triggered.
- No changes to the gateway file-serving logic or plugin build configuration.
- `syncRemoteEntry` is a no-op if the URL did not change, so there is no overhead
  during normal use.
- The `?v=` parameter is also a natural cache-control hint for the browser's HTTP
  cache and any CDN layer added in the future.

### Negative

- `statSync` is called on every `/studio/registry` request (once per plugin per
  request). For a typical number of plugins (< 20) this is negligible, but it is a
  synchronous filesystem call on the request path.
- `registerRemotes({ force: true })` is a relatively new API in
  `@module-federation/runtime`. Its exact semantics around already-loaded module
  chunks are not fully documented; if MF runtime caches the JS chunks at the
  `loadRemote` level (not just the entry), a navigation-triggered reload may still
  serve a stale chunk from the in-memory module cache.
- The mtime approach only tracks _file_ changes. If `remoteEntry.js` is replaced
  with content identical to the previous build (e.g. identical source, same hash),
  mtime will still change and trigger a re-fetch (harmless but slightly wasteful).

### Alternatives Considered

See the table in the Context section.

## Implementation

**Changed files:**

| File | Change |
|------|--------|
| `rest-api-core/src/studio-registry.ts` | `getRemoteEntryVersion()` + `?v=<mtime>` in URL |
| `studio-federation/src/widget-loader.ts` | `knownRemotes` Map, `syncRemoteEntry()`, `loadPageComponent` accepts `remoteEntryUrl?` |
| `studio-federation/src/page-container.tsx` | `remoteEntryUrl?` prop, passed to `loadPageComponent` |
| `studio-federation/src/index.ts` | Export `syncRemoteEntry` |
| `studio/src/routes/plugin-page-v2.tsx` | Pass `plugin.remoteEntryUrl` to `PageContainer` |
| `studio/src/providers/registry-v2-provider.tsx` | Reverted to single-init guard; added comment |

**No changes required to:**
- Plugin build configs (`rspack.studio.config.mjs`)
- Gateway static file serving
- Plugin manifests

## References

- [`@module-federation/runtime` registerRemotes API](https://module-federation.io/guide/basic/runtime.html)
- [ADR-0022: Studio Widget System V2](./0022-studio-widget-system-v2.md)
- [ADR-0023: Rspack for Module Federation](./0023-rspack-for-module-federation.md)

---

**Last Updated:** 2026-04-05
