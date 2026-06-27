---
id: PC-005
area: platform-core
title: Platform update
priority: P0
env: kb-env (older version installed)
requires: PC-001, PC-002
---

## Goal

Developer updates KB Labs to the latest version. All services start cleanly
after the update. Config, marketplace lock, and existing workflows survive.

## Environment

- [ ] Previous version installed (not latest)
- [ ] At least one workflow YAML in `.kb/workflows/`
- [ ] `marketplace.lock` exists with at least one entity

---

## Steps

### Phase 1 — Before update (baseline)

| # | Action | Expected |
|---|--------|----------|
| 1 | `kb-create --version` | Record current version (e.g. `2.93.0`) |
| 2 | `kb --help` | Commands listed — record visible commands |
| 3 | `kb-dev start` | Services up |
| 4 | `cat .kb/marketplace.lock \| jq '.hashes \| keys'` | Record installed entities |

### Phase 2 — Update

| # | Action | Expected |
|---|--------|----------|
| 5 | `kb-dev stop` | All services stopped |
| 6 | `kb-create update --yes` | Update runs, no errors |
| 7 | `kb-create --version` | Higher version than step 1 |
| 8 | `kb-dev --version` | Updated |
| 9 | `kb --version` | Updated |

### Phase 3 — Post-update verification

| # | Action | Expected |
|---|--------|----------|
| 10 | `kb-create doctor` | All checks pass |
| 11 | `kb-dev start` | All services start cleanly |
| 12 | `kb-dev status` | All running |
| 13 | `curl -s http://localhost:4000/health` | Healthy |
| 14 | `kb --help` | Same commands as before + any new ones |
| 15 | `.kb/marketplace.lock` unchanged | Same entities as step 4 |
| 16 | `.kb/workflows/` unchanged | Workflow YAMLs intact |
| 17 | `.kb/kb.config.json` unchanged | Config not overwritten |

### Phase 4 — Run a workflow after update

| # | Action | Expected |
|---|--------|----------|
| 18 | `kb workflow run <name>` | Run starts successfully |
| 19 | `kb workflow runs list` | Run appears in list |

---

## Pass criteria

Version increments. All services start. Config, lock, and workflows survive.
Existing workflows run after update.

## Notes

- `.kb/kb.config.json` must NOT be overwritten by update — it's user config
- `marketplace.lock` must NOT be reset — user's installed entities must survive
