---
id: S-024
title: Platform — Rollback
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
After a bad update, developer rolls back to previous platform version and services restore to working state.

## Prerequisites
- [ ] Platform updated at least once (previous release exists)
- [ ] `kb-create rollback` command available

---

## Steps

### Phase 1 — Trigger bad state (simulate)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb-create releases` | Shows available releases (current + previous) | | ⬜ |
| 2 | Note current release ID | | | ⬜ |

### Phase 2 — Rollback

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | `kb-create rollback` | Activates previous release | | ⬜ |
| 4 | Output shows which release was restored | Clear confirmation | | ⬜ |
| 5 | `kb-dev restart` | Services restart on rolled-back release | | ⬜ |
| 6 | `curl http://localhost:4000/health` | Services healthy | | ⬜ |

### Phase 3 — Verify

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | `kb-create status` | Shows previous version | | ⬜ |
| 8 | `kb commit commit --dry-run` | Works on rolled-back version | | ⬜ |

### Phase 4 — Re-roll forward

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 9 | `kb-create update --yes` | Re-applies latest | | ⬜ |

---

## Result
## Bugs
## Notes
