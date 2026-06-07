---
id: S-021
title: Studio — View workflow runs
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer monitors workflow runs in Studio UI — sees status, drill into jobs, reads logs.

## Prerequisites
- [ ] Studio accessible (S-020 passed)
- [ ] At least 2 workflow runs in history (completed + failed)

---

## Steps

### Phase 1 — Runs list

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Navigate to Workflows section in Studio | Page loads without error | | ⬜ |
| 2 | Runs list shows id, workflow name, status, started time | Data visible | | ⬜ |
| 3 | Status badges: green (completed), red (failed), yellow (running) | Visual distinction clear | | ⬜ |
| 4 | List updates when new run is triggered | Live update or auto-refresh works | | ⬜ |

### Phase 2 — Run detail

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | Click on a run | Opens detail view with jobs list | | ⬜ |
| 6 | Each job shows status + duration | All jobs visible | | ⬜ |
| 7 | Click on a failed job | Error message shown | | ⬜ |

### Phase 3 — Logs

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | Click "View logs" on a job | Step output displayed | | ⬜ |
| 9 | Long log doesn't freeze browser | Scrollable, not rendering 10k lines at once | | ⬜ |

---

## Result
## Bugs
## Notes
