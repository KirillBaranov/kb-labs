---
id: S-025
title: Platform — Diagnose broken setup
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Something is broken. Developer uses built-in diagnostics to find and fix the issue without external help.

## Prerequisites
- [ ] KB Labs installed
- [ ] One of: service won't start / command not found / plugin not loading

---

## Steps

### Phase 1 — Doctor

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb-create doctor` | Shows clearly which checks failed and why | | ⬜ |
| 2 | Failed check has actionable hint | "Run X to fix" or "Check Y file" | | ⬜ |
| 3 | All environment issues surfaced in one run | Don't need to run multiple tools | | ⬜ |

### Phase 2 — Command not found

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `kb diag --command "foo bar"` | Shows discovery chain: lock → manifest → validation | | ⬜ |
| 5 | `rootCause` clearly identified | Not just "unknown command" | | ⬜ |
| 6 | Fix suggestion is specific | Points to exact file/field to fix | | ⬜ |

### Phase 3 — Service won't start

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | `kb-dev start` — one service fails | Clear error in output (not just `ERR`) | | ⬜ |
| 8 | `kb-dev logs <service>` | Full error logs visible | | ⬜ |
| 9 | Port conflict case | Error says "port X in use" with which port | | ⬜ |

### Phase 4 — Stale cache

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 10 | Plugin not showing after build | `kb marketplace plugins refresh` fixes it | | ⬜ |
| 11 | Clear cache message is user-friendly | Not just silent exit | | ⬜ |

### Phase 5 — Full reset

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 12 | `kb-create doctor --fix` (if exists) | Auto-fixes recoverable issues | | ⬜ |
| 13 | As last resort: reinstall from scratch | `kb-create update --force` or similar | | ⬜ |

---

## Result
## Bugs
## Notes
