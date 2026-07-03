---
id: PC-006
area: platform-core
title: Platform rollback
priority: P1
env: kb-env (after update)
requires: PC-005
---

## Goal

If an update breaks something, developer can roll back to the previous version
and get a working platform again.

## Environment

- [ ] PC-005 completed — platform was just updated to newer version
- [ ] Previous version number noted

---

## Steps

### Phase 1 — Trigger rollback

| # | Action | Expected |
|---|--------|----------|
| 1 | `kb-create --version` | Current (updated) version |
| 2 | `kb-dev stop` | Services stopped |
| 3 | `kb-create rollback --yes` | Rollback runs, previous version restored |
| 4 | `kb-create --version` | Previous version from PC-005 step 1 |

### Phase 2 — Post-rollback verification

| # | Action | Expected |
|---|--------|----------|
| 5 | `kb-create doctor` | All checks pass |
| 6 | `kb-dev start` | Services start |
| 7 | `kb-dev status` | All running |
| 8 | `curl -s http://localhost:4000/health` | Healthy |
| 9 | `.kb/kb.config.json` intact | Config not changed by rollback |
| 10 | `.kb/marketplace.lock` intact | Installed entities unchanged |

### Phase 3 — Rollback when no previous version

| # | Action | Expected |
|---|--------|----------|
| 11 | On fresh install (no prior version), run `kb-create rollback` | Clear error: "No previous version to roll back to" |
| 12 | Exit code non-zero | `echo $?` → 1 |
| 13 | Platform is still in working state | `kb-create doctor` passes |

---

## Pass criteria

Rollback restores the previous version. Services start after rollback.
Config and lock survive. Rollback with no history gives clear error, doesn't corrupt state.
