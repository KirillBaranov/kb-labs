---
id: S-012
title: Marketplace — Update plugin
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer updates an installed plugin to a newer version. Commands continue to work after update.

## Prerequisites
- [ ] Plugin installed at older version
- [ ] Newer version available in registry

---

## Steps

### Phase 1 — Check for updates

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb marketplace plugins list --outdated` (if exists) | Shows plugins with newer versions available | | ⬜ |
| 2 | `kb marketplace plugins list` | Shows current vs latest version per plugin | | ⬜ |

### Phase 2 — Update

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | `kb marketplace update <plugin-name>` | Downloads new version, swaps atomically | | ⬜ |
| 4 | `cat .kb/marketplace.lock` | Version bumped, old integrity replaced | | ⬜ |
| 5 | `kb --help` | Plugin commands still visible after update | | ⬜ |
| 6 | Run a command from updated plugin | Works correctly | | ⬜ |

### Phase 3 — Update all

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | `kb marketplace update` (no args) | Updates all outdated plugins | | ⬜ |
| 8 | Rollback if update fails mid-way | Previous version still works | | ⬜ |

---

## Result
## Bugs
## Notes
