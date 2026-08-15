---
id: S-026
title: Plugin — Publish to marketplace
persona: plugin-author
priority: P1
automation: manual
e2e: —
---

## Goal
Developer publishes their plugin to the KB Labs marketplace registry so other users can install it.

## Prerequisites
- [ ] Plugin built and working locally (S-013 passed)
- [ ] `kb-deploy` or `kb hub publish` available
- [ ] Marketplace registry credentials / access token

---

## Steps

### Phase 1 — Pre-publish checks

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `pnpm build` in plugin dir | Build passes, no TS errors | | ⬜ |
| 2 | `pnpm type-check` | No type errors | | ⬜ |
| 3 | `pnpm test` (if tests exist) | Tests pass | | ⬜ |
| 4 | `manifest.js` valid: `kb diag --command "<plugin> <cmd>"` | No MANIFEST_VALIDATION_FAILED | | ⬜ |

### Phase 2 — Publish

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | `kb hub publish` (or `pnpm publish` to registry) | Upload succeeds, version live | | ⬜ |
| 6 | Output shows published version + registry URL | Confirmation with link | | ⬜ |
| 7 | `kb marketplace plugins list` on a different machine | New plugin visible in registry | | ⬜ |

### Phase 3 — Install published plugin

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | `kb marketplace install <plugin-name>` on fresh project | Installs from registry | | ⬜ |
| 9 | `kb <plugin> hello` | Works identically to local version | | ⬜ |

### Phase 4 — Publish new version

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 10 | Bump version in `package.json`, rebuild, republish | New version appears in registry | | ⬜ |
| 11 | Existing installs still work on old version | No forced upgrade | | ⬜ |
| 12 | `kb marketplace update <plugin-name>` | Upgrades to new version | | ⬜ |

### Phase 5 — Errors

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 13 | Publish without auth | Clear error: "not authenticated" | | ⬜ |
| 14 | Publish same version twice | Clear error: "version already exists" — not silent overwrite | | ⬜ |
| 15 | Publish with invalid manifest (missing fields) | Validation error before upload — not rejected server-side silently | | ⬜ |

---

## Result
## Bugs
## Notes
