---
id: S-023
title: Platform — Update
persona: solo-developer
priority: P0
automation: e2e-done
e2e: e2e/install-flow/test.sh (steps 10–10c)
---

## Goal
Developer updates KB Labs to latest version. All services, plugins, and credentials survive the update.

## Prerequisites
- [ ] KB Labs installed at a version older than latest
- [ ] At least one custom plugin installed
- [ ] Valid credentials in `.env`

---

## Steps

### Phase 1 — Pre-update state

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb-create status` | Note current version of all packages | | ⬜ |
| 2 | `cat .kb/marketplace.lock` | Note installed plugins + versions | | ⬜ |

### Phase 2 — Update

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | `kb-create update --yes` | Completes without error | | ⬜ |
| 4 | Output shows what was updated | Package names + old→new versions | | ⬜ |
| 5 | `.kb/marketplace.lock` preserved | User plugins still listed | | ⬜ |

### Phase 3 — Post-update verification

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | `kb --help` | All plugins still visible | | ⬜ |
| 7 | `kb-create doctor` | All checks pass | | ⬜ |
| 8 | `cat .env` | `KB_GATEWAY_CLIENT_ID` + `KB_GATEWAY_CLIENT_SECRET` intact | | ⬜ |
| 9 | `kb commit commit --dry-run` | Works as before update | | ⬜ |
| 10 | Custom plugin commands still work | Not broken by update | | ⬜ |

### Phase 4 — Re-update (idempotency)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 11 | `kb-create update --yes` when already at latest | "Already up to date" or no-op | | ⬜ |

---

## Result
## Bugs
## Notes
