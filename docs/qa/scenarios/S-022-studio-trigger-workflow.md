---
id: S-022
title: Studio — Trigger workflow from UI
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer triggers a workflow from Studio UI with custom inputs and monitors it to completion.

## Prerequisites
- [ ] Studio accessible, logged in (S-020 passed)
- [ ] At least one workflow with defined inputs exists

---

## Steps

### Phase 1 — Trigger

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Navigate to workflow detail page | Shows workflow info + "Run" button | | ⬜ |
| 2 | Click "Run" | Input form appears with fields from workflow `inputs` schema | | ⬜ |
| 3 | Fill inputs, click "Start run" | Run created, redirects to run detail | | ⬜ |

### Phase 2 — Monitor

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Run detail shows live status | Status updates without page refresh | | ⬜ |
| 5 | Jobs appear as they start/complete | Real-time job updates | | ⬜ |
| 6 | Run completes, final status shown | `completed` or `failed` with clear UI | | ⬜ |

### Phase 3 — Cancel from UI

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | While run is running, click "Cancel" | Confirmation dialog appears | | ⬜ |
| 8 | Confirm cancel | Run stops, status = `cancelled` | | ⬜ |

---

## Result
## Bugs
## Notes
