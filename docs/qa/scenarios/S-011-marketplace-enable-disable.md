---
id: S-011
title: Marketplace — Enable / disable plugin
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer can temporarily disable a plugin without uninstalling it, and re-enable it later.

## Prerequisites
- [ ] At least one plugin installed (e.g. from S-010)
- [ ] Services running

---

## Steps

### Phase 1 — Disable

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb marketplace plugins disable <name>` | Plugin marked disabled | | ⬜ |
| 2 | `kb --help` after disable | Plugin commands no longer visible | | ⬜ |
| 3 | `cat .kb/marketplace.lock` | Plugin entry has `"enabled": false` | | ⬜ |

### Phase 2 — Re-enable

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `kb marketplace plugins enable <name>` | Plugin re-enabled | | ⬜ |
| 5 | `kb --help` | Plugin commands back | | ⬜ |

### Phase 3 — Edge cases

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | Disable a plugin that has running commands | Graceful — completes current, then disables | | ⬜ |
| 7 | Disable non-existent plugin | Clear error: "plugin not found" | | ⬜ |

---

## Result
## Bugs
## Notes
